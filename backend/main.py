import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv()
import uuid
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, Query, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, init_db, ExecutiveDB, ActionItemDB, OAuthTokenDB, UserDB, UserWorkspaceDB, verify_password, hash_password, ActivityLogDB, InvitationDB
from agent import parse_voice_transcription
from calendar_service import CalendarService

# Initialize SQLite database on API start
init_db()

SECRET_KEY = os.environ.get("JWT_SECRET", "super-secret-key-12345")
ALGORITHM = "HS256"

security = HTTPBearer()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(days=1)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.PyJWTError:
        return None

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    payload = verify_token(token)
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid token or expired session")
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token payload")
    user = db.query(UserDB).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

def get_current_admin(current_user: UserDB = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

def log_activity(db: Session, user_id: Optional[str], action_type: str, description: str):
    try:
        new_log = ActivityLogDB(
            id=f"log_{uuid.uuid4().hex[:8]}",
            user_id=user_id,
            action_type=action_type,
            description=description
        )
        db.add(new_log)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"Error logging activity: {e}")

def get_email_domain(email: str) -> Optional[str]:
    email = email.strip().lower()
    if "@" not in email:
        return None
    domain = email.split("@")[-1]
    public_domains = {
        "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", 
        "live.com", "icloud.com", "aol.com", "zoho.com", 
        "proton.me", "protonmail.com", "mail.com", "gmx.com", 
        "yandex.com"
    }
    if domain in public_domains:
        return None
    return domain

def verify_user_workspace_access(user: UserDB, executive_id: str, db: Session, require_write: bool = False):
    workspace = db.query(ExecutiveDB).filter_by(id=executive_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if workspace.owner_id == user.id:
        return
    access = db.query(UserWorkspaceDB).filter_by(user_id=user.id, executive_id=executive_id).first()
    if not access:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: User does not have permission to access workspace {executive_id}"
        )
    if require_write and access.permission == "read":
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: User has read-only access to workspace {executive_id}"
        )

app = FastAPI(title="Executive AI Assistant Backend")

# Enable CORS for the frontend dev server and production URLs
allowed_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
env_origins = os.environ.get("ALLOWED_ORIGINS")
if env_origins:
    allowed_origins.extend([o.strip() for o in env_origins.split(",") if o.strip()])

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# Pydantic schemas for serialization
class ExecutiveResponse(BaseModel):
    id: str
    name: str
    role: str
    avatar: Optional[str] = None
    email: str
    owner_id: Optional[str] = None
    permission: Optional[str] = "write"

    class Config:
        from_attributes = True

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class CreateWorkspaceRequest(BaseModel):
    name: str
    role: str
    email: str
    avatar: Optional[str] = None

class ActionItemResponse(BaseModel):
    id: str
    type: str
    title: str
    description: str
    time_proposed: Optional[str] = None
    recipient: Optional[str] = None
    status: str
    executive_id: str

    class Config:
        from_attributes = True

class AdminUserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    allowed_executives: List[str]

class AdminUserCreateRequest(BaseModel):
    email: str
    password: str
    name: str
    role: str

class AdminUserUpdateRequest(BaseModel):
    email: str
    name: str
    role: str
    password: Optional[str] = None

class AdminWorkspaceResponse(BaseModel):
    id: str
    name: str
    role: str
    email: str
    avatar: Optional[str] = None
    owner_id: Optional[str] = None
    owner_name: Optional[str] = None
    mapped_users_count: int = 0

class AdminWorkspaceCreateRequest(BaseModel):
    name: str
    role: str
    email: str
    avatar: Optional[str] = None
    owner_id: Optional[str] = None

class AdminWorkspaceUpdateRequest(BaseModel):
    name: str
    role: str
    email: str
    avatar: Optional[str] = None
    owner_id: Optional[str] = None

class AdminWorkspaceUsersRequest(BaseModel):
    user_ids: List[str]

class WorkspaceMemberUpdate(BaseModel):
    user_id: Optional[str] = None
    email: Optional[str] = None
    has_access: bool
    permission: str  # "read" or "write"
    is_pending: Optional[bool] = False

class WorkspaceMembersRequest(BaseModel):
    members: List[WorkspaceMemberUpdate]

class WorkspaceInviteRequest(BaseModel):
    email: str
    permission: str  # "read" or "write"

class AdminLogResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    action_type: str
    description: str
    created_at: datetime

    class Config:
        from_attributes = True

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str
    allowed_executives: List[str]

class LoginResponse(BaseModel):
    token: str
    user: UserResponse

# API Endpoints

@app.post("/api/auth/login", response_model=LoginResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    user = db.query(UserDB).filter_by(email=email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role})
    log_activity(db, user.id, "user_login", f"User {user.name} ({user.email}) logged in successfully.")
    owned = db.query(ExecutiveDB.id).filter(ExecutiveDB.owner_id == user.id).all()
    owned_ids = [o[0] for o in owned]
    mappings = db.query(UserWorkspaceDB.executive_id).filter(UserWorkspaceDB.user_id == user.id).all()
    mapped_ids = [m[0] for m in mappings]
    allowed_executives = list(set(owned_ids + mapped_ids))
    
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "allowed_executives": allowed_executives
        }
    }

@app.post("/api/auth/register", response_model=LoginResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    if db.query(UserDB).filter_by(email=email).first():
        raise HTTPException(status_code=400, detail="Email is already registered")
    
    new_user = UserDB(
        id=f"user_{uuid.uuid4().hex[:8]}",
        email=email,
        hashed_password=hash_password(req.password),
        name=req.name,
        role="executive"
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    log_activity(db, new_user.id, "user_register", f"New user account registered: {new_user.name} ({new_user.email})")
    
    # Check for pending invitations
    pending_invites = db.query(InvitationDB).filter_by(email=email).all()
    invited_mapped_executives = []
    for invite in pending_invites:
        existing_mapping = db.query(UserWorkspaceDB).filter_by(user_id=new_user.id, executive_id=invite.executive_id).first()
        if not existing_mapping:
            mapping_id = f"map_invite_{uuid.uuid4().hex[:8]}"
            new_mapping = UserWorkspaceDB(
                id=mapping_id,
                user_id=new_user.id,
                executive_id=invite.executive_id,
                permission=invite.permission
            )
            db.add(new_mapping)
            invited_mapped_executives.append(invite.executive_id)
        db.delete(invite)
    
    if invited_mapped_executives:
        db.commit()
        log_activity(db, new_user.id, "workspace_invite_consume", f"Consumed pending invitations for user {new_user.email}, mapping to {len(invited_mapped_executives)} workspace(s).")
    
    # Domain-based organization auto-mapping
    domain = get_email_domain(email)
    auto_mapped_executives = []
    if domain:
        existing_users = db.query(UserDB).filter(UserDB.email.like(f"%@{domain}"), UserDB.id != new_user.id).all()
        existing_user_ids = [u.id for u in existing_users]
        if existing_user_ids:
            workspaces = db.query(ExecutiveDB).filter(ExecutiveDB.owner_id.in_(existing_user_ids)).all()
            for ws in workspaces:
                # Skip if already mapped via invitation
                if ws.id in invited_mapped_executives:
                    continue
                # Map new user to workspace with read access
                mapping_id = f"map_auto_{uuid.uuid4().hex[:8]}"
                new_mapping = UserWorkspaceDB(
                    id=mapping_id,
                    user_id=new_user.id,
                    executive_id=ws.id,
                    permission="read"
                )
                db.add(new_mapping)
                auto_mapped_executives.append(ws.id)
            db.commit()
            if auto_mapped_executives:
                log_activity(db, new_user.id, "org_auto_map", f"Auto-mapped new user {new_user.email} to {len(auto_mapped_executives)} workspace(s) of organization {domain} with read-only access.")

    allowed_executives = list(set(invited_mapped_executives + auto_mapped_executives))
    token = create_access_token({"sub": new_user.id, "email": new_user.email, "role": new_user.role})
    return {
        "token": token,
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name,
            "role": new_user.role,
            "allowed_executives": allowed_executives
        }
    }

@app.get("/api/auth/me", response_model=UserResponse)
def get_me(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    owned = db.query(ExecutiveDB.id).filter(ExecutiveDB.owner_id == current_user.id).all()
    owned_ids = [o[0] for o in owned]
    mappings = db.query(UserWorkspaceDB.executive_id).filter(UserWorkspaceDB.user_id == current_user.id).all()
    mapped_ids = [m[0] for m in mappings]
    allowed_executives = list(set(owned_ids + mapped_ids))
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "allowed_executives": allowed_executives
    }

@app.get("/api/executives", response_model=List[ExecutiveResponse])
def get_executives(current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    List all registered executives (multi-tenant workspaces) the authenticated user has access to.
    """
    executives = db.query(ExecutiveDB).filter(
        (ExecutiveDB.owner_id == current_user.id) | 
        (ExecutiveDB.id.in_(db.query(UserWorkspaceDB.executive_id).filter(UserWorkspaceDB.user_id == current_user.id)))
    ).all()
    
    for ex in executives:
        if ex.owner_id == current_user.id:
            ex.permission = "write"
        else:
            mapping = db.query(UserWorkspaceDB).filter_by(user_id=current_user.id, executive_id=ex.id).first()
            ex.permission = mapping.permission if mapping else "read"
            
    return executives

@app.post("/api/workspaces", response_model=ExecutiveResponse)
def create_workspace(req: CreateWorkspaceRequest, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    existing = db.query(ExecutiveDB).filter_by(email=req.email.strip().lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="A workspace with this email address already exists.")
        
    new_workspace = ExecutiveDB(
        id=f"exec_{uuid.uuid4().hex[:8]}",
        name=req.name,
        role=req.role,
        email=req.email.strip().lower(),
        avatar=req.avatar or "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
        owner_id=current_user.id
    )
    db.add(new_workspace)
    db.commit()
    db.refresh(new_workspace)
    
    # Auto-map existing users of the same custom organization domain
    domain = get_email_domain(current_user.email)
    if domain:
        other_users = db.query(UserDB).filter(UserDB.email.like(f"%@{domain}"), UserDB.id != current_user.id).all()
        for ou in other_users:
            mapping_id = f"map_auto_{uuid.uuid4().hex[:8]}"
            new_mapping = UserWorkspaceDB(
                id=mapping_id,
                user_id=ou.id,
                executive_id=new_workspace.id,
                permission="read"
            )
            db.add(new_mapping)
        db.commit()
        if other_users:
            log_activity(db, current_user.id, "workspace_auto_map", f"Auto-mapped {len(other_users)} member(s) of organization {domain} to workspace '{new_workspace.name}' with read-only access.")
            
    log_activity(db, current_user.id, "workspace_create", f"Workspace '{new_workspace.name}' ({new_workspace.email}) created by user {current_user.name}.")
    new_workspace.permission = "write"
    return new_workspace

@app.delete("/api/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    workspace = db.query(ExecutiveDB).filter_by(id=workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
        
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner of this workspace can delete it.")
        
    workspace_name = workspace.name
    workspace_email = workspace.email
    db.delete(workspace)
    db.commit()
    log_activity(db, current_user.id, "workspace_delete", f"Workspace '{workspace_name}' ({workspace_email}) deleted by user {current_user.name}.")
    return {"status": "success", "message": f"Workspace '{workspace_name}' successfully deleted."}

@app.get("/api/workspaces/{workspace_id}/members")
def get_workspace_members(workspace_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    workspace = db.query(ExecutiveDB).filter_by(id=workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
        
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the workspace owner can view organization members.")
        
    # Get organization domain of the owner
    domain = get_email_domain(current_user.email)
    results = []
    if not domain:
        # User has a public domain (e.g. gmail.com). Only return users already mapped to this workspace.
        mappings = db.query(UserWorkspaceDB).filter_by(executive_id=workspace_id).all()
        mapped_user_ids = [m.user_id for m in mappings]
        mapped_users = db.query(UserDB).filter(UserDB.id.in_(mapped_user_ids)).all()
        
        for u in mapped_users:
            m = next((mp for mp in mappings if mp.user_id == u.id), None)
            results.append({
                "user_id": u.id,
                "name": u.name,
                "email": u.email,
                "has_access": True,
                "permission": m.permission if m else "read",
                "is_owner": u.id == workspace.owner_id,
                "is_pending": False
            })
    else:
        # Find all users sharing this domain
        org_users = db.query(UserDB).filter(UserDB.email.like(f"%@{domain}")).all()
        mappings = db.query(UserWorkspaceDB).filter_by(executive_id=workspace_id).all()
        mapping_dict = {m.user_id: m for m in mappings}
        
        # Combine org_users and any external mapped users
        org_user_ids = {u.id for u in org_users}
        mapped_user_ids = [m.user_id for m in mappings]
        external_mapped_users = db.query(UserDB).filter(
            UserDB.id.in_(mapped_user_ids), 
            ~UserDB.id.in_(org_user_ids)
        ).all()
        
        all_display_users = list(org_users) + list(external_mapped_users)
        
        for u in all_display_users:
            is_owner = u.id == workspace.owner_id
            m = mapping_dict.get(u.id)
            results.append({
                "user_id": u.id,
                "name": u.name,
                "email": u.email,
                "has_access": is_owner or m is not None,
                "permission": "write" if is_owner else (m.permission if m else "read"),
                "is_owner": is_owner,
                "is_pending": False
            })
            
    # Fetch pending invitations
    invitations = db.query(InvitationDB).filter_by(executive_id=workspace_id).all()
    for invite in invitations:
        results.append({
            "user_id": None,
            "name": "Pending Signup",
            "email": invite.email,
            "has_access": True,
            "permission": invite.permission,
            "is_owner": False,
            "is_pending": True
        })
        
    return results

@app.post("/api/workspaces/{workspace_id}/members")
def update_workspace_members(workspace_id: str, req: WorkspaceMembersRequest, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    workspace = db.query(ExecutiveDB).filter_by(id=workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
        
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the workspace owner can manage organization members.")
        
    # Process each member update
    for member in req.members:
        # Handle pending invitations
        if member.is_pending:
            if not member.email:
                continue
            email = member.email.strip().lower()
            existing_invite = db.query(InvitationDB).filter_by(email=email, executive_id=workspace_id).first()
            if not member.has_access:
                if existing_invite:
                    db.delete(existing_invite)
                    log_activity(db, current_user.id, "workspace_invite_cancel", f"Cancelled invitation for {email} to workspace '{workspace.name}'.")
            else:
                if existing_invite:
                    if existing_invite.permission != member.permission:
                        old_perm = existing_invite.permission
                        existing_invite.permission = member.permission
                        log_activity(db, current_user.id, "workspace_invite_update", f"Updated invitation permission for {email} on workspace '{workspace.name}' from {old_perm} to {member.permission}.")
            continue

        # Don't allow workspace owner to modify their own access
        if member.user_id == workspace.owner_id:
            continue
            
        target_user = db.query(UserDB).filter_by(id=member.user_id).first()
        if not target_user:
            continue
            
        existing_mapping = db.query(UserWorkspaceDB).filter_by(user_id=member.user_id, executive_id=workspace_id).first()
        
        if not member.has_access:
            if existing_mapping:
                db.delete(existing_mapping)
                log_activity(db, current_user.id, "workspace_member_remove", f"Removed access for user {target_user.name} ({target_user.email}) from workspace '{workspace.name}'.")
        else:
            if existing_mapping:
                if existing_mapping.permission != member.permission:
                    old_perm = existing_mapping.permission
                    existing_mapping.permission = member.permission
                    log_activity(db, current_user.id, "workspace_member_role_update", f"Updated permission for user {target_user.name} ({target_user.email}) on workspace '{workspace.name}' from {old_perm} to {member.permission}.")
            else:
                mapping_id = f"map_owner_{uuid.uuid4().hex[:8]}"
                new_mapping = UserWorkspaceDB(
                    id=mapping_id,
                    user_id=member.user_id,
                    executive_id=workspace_id,
                    permission=member.permission
                )
                db.add(new_mapping)
                log_activity(db, current_user.id, "workspace_member_add", f"Added user {target_user.name} ({target_user.email}) to workspace '{workspace.name}' with {member.permission} access.")
                
    db.commit()
    return {"status": "success", "message": "Workspace members updated successfully."}

@app.post("/api/workspaces/{workspace_id}/invite")
def invite_workspace_member(workspace_id: str, req: WorkspaceInviteRequest, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    workspace = db.query(ExecutiveDB).filter_by(id=workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
        
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the workspace owner can invite members.")
        
    email = req.email.strip().lower()
    
    # Check if email is owner's email
    owner_user = db.query(UserDB).filter_by(id=workspace.owner_id).first()
    if owner_user and email == owner_user.email:
        raise HTTPException(status_code=400, detail="Cannot invite the workspace owner.")
        
    # Check if user already exists
    target_user = db.query(UserDB).filter_by(email=email).first()
    
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    inviter_name = current_user.name
    workspace_name = workspace.name
    workspace_role = workspace.role
    
    from email_service import EmailService
    
    # Define common email content
    subject = f"You are invited to join the {workspace_name} workspace"
    
    if target_user:
        existing_mapping = db.query(UserWorkspaceDB).filter_by(user_id=target_user.id, executive_id=workspace_id).first()
        if existing_mapping:
            raise HTTPException(status_code=400, detail="User already has access to this workspace.")
            
        mapping_id = f"map_owner_{uuid.uuid4().hex[:8]}"
        new_mapping = UserWorkspaceDB(
            id=mapping_id,
            user_id=target_user.id,
            executive_id=workspace_id,
            permission=req.permission
        )
        db.add(new_mapping)
        db.commit()
        log_activity(db, current_user.id, "workspace_member_add", f"Added user {target_user.name} ({target_user.email}) to workspace '{workspace.name}' with {req.permission} access.")
        
        # Send invitation email for existing user
        body = f"Hello,\n\nYou have been invited to join the workspace '{workspace_name}' ({workspace_role}) as a {req.permission} member.\n\nYou can log in and access it directly here: {frontend_url}\n\nBest regards,\n{inviter_name}"
        try:
            EmailService.send_email(db, workspace_id, email, subject, body)
        except Exception as e:
            print(f"Error sending email to existing user: {e}")
            
        return {"status": "success", "message": f"Successfully added {email} to the workspace. Notification email sent."}
    else:
        # Check if already invited
        existing_invitation = db.query(InvitationDB).filter_by(email=email, executive_id=workspace_id).first()
        body = f"Hello,\n\nYou have been invited to join the workspace '{workspace_name}' ({workspace_role}) as a {req.permission} member.\n\nTo access this workspace, please sign up using this email address here: {frontend_url}\n\nBest regards,\n{inviter_name}"
        
        if existing_invitation:
            if existing_invitation.permission != req.permission:
                existing_invitation.permission = req.permission
                db.commit()
                # Resend invitation email
                try:
                    EmailService.send_email(db, workspace_id, email, subject, body)
                except Exception as e:
                    print(f"Error sending email: {e}")
                return {"status": "success", "message": f"Updated invitation permission for {email}. Notification email sent."}
            raise HTTPException(status_code=400, detail="This user is already invited to this workspace.")
            
        invitation_id = f"invite_{uuid.uuid4().hex[:8]}"
        new_invite = InvitationDB(
            id=invitation_id,
            email=email,
            executive_id=workspace_id,
            permission=req.permission,
            invited_by=current_user.id
        )
        db.add(new_invite)
        db.commit()
        log_activity(db, current_user.id, "workspace_invite", f"Invited {email} to workspace '{workspace.name}' with {req.permission} access (pending registration).")
        
        # Send invitation email for new user
        try:
            EmailService.send_email(db, workspace_id, email, subject, body)
        except Exception as e:
            print(f"Error sending email to new user: {e}")
            
        return {"status": "success", "message": f"Invitation sent to {email}."}

@app.get("/api/dashboard", response_model=List[ActionItemResponse])
def get_dashboard(executive_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Fetch all pending actions for a specific executive.
    """
    verify_user_workspace_access(current_user, executive_id, db)
    actions = db.query(ActionItemDB).filter(
        ActionItemDB.executive_id == executive_id,
        ActionItemDB.status == "pending"
    ).all()
    return actions

@app.get("/api/meetings")
def get_upcoming_meetings(executive_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Fetch upcoming meetings for a specific executive.
    """
    verify_user_workspace_access(current_user, executive_id, db)
    meetings = CalendarService.list_upcoming_meetings(db, executive_id)
    return meetings

from fastapi.responses import JSONResponse

class CreateActionRequest(BaseModel):
    executive_id: str
    type: str
    title: str
    description: str
    time_proposed: Optional[str] = None
    recipient: Optional[str] = None

def process_action_input(executive_id: str, text: str, db: Session, input_mode: str, timezone: str = "UTC"):
    # Process via LangChain AI agent
    parsed_info = parse_voice_transcription(text)

    # Check for missing calendar scheduling requirements
    if parsed_info["type"] == "calendar":
        missing = []
        if not parsed_info.get("time_proposed"):
            missing.append("time_proposed")
        if not parsed_info.get("title") or parsed_info.get("title").lower() == "schedule meeting":
            missing.append("title")
            
        if missing:
            return JSONResponse(
                status_code=422,
                content={
                    "status": "requires_input",
                    "message": f"Missing details for meeting: {', '.join(missing)}",
                    "missing_fields": missing,
                    "parsed_info": parsed_info
                }
            )

    # Note: We no longer schedule a tentative slot/soft-lock during pending action item creation.
    # The meeting will only be created on the calendar once manually approved.

    new_action = ActionItemDB(
        id=f"act_{uuid.uuid4().hex[:8]}",
        type=parsed_info["type"],
        title=parsed_info["title"],
        description=f"{input_mode} Input: {parsed_info['description']}",
        time_proposed=parsed_info.get("time_proposed"),
        recipient=parsed_info.get("recipient"),
        status="pending",
        executive_id=executive_id
    )
    db.add(new_action)
    db.commit()
    db.refresh(new_action)
    return new_action

@app.post("/api/voice-action")
def process_voice_action(executive_id: str, text: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db), x_timezone: Optional[str] = Header(None)):
    """
    Ingests voice transcription memo, validates calendar slots, and persists card.
    """
    verify_user_workspace_access(current_user, executive_id, db, require_write=True)
    exec_exists = db.query(ExecutiveDB).filter_by(id=executive_id).first()
    if not exec_exists:
        raise HTTPException(status_code=404, detail="Executive workspace not found")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Voice transcription text cannot be empty.")
        
    return process_action_input(executive_id, text, db, "Voice", timezone=x_timezone or "UTC")

@app.post("/api/text-action")
def process_text_action(executive_id: str, text: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db), x_timezone: Optional[str] = Header(None)):
    """
    Ingests typed directive text, validates calendar slots, and persists card.
    """
    verify_user_workspace_access(current_user, executive_id, db, require_write=True)
    exec_exists = db.query(ExecutiveDB).filter_by(id=executive_id).first()
    if not exec_exists:
        raise HTTPException(status_code=404, detail="Executive workspace not found")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text directive cannot be empty.")
        
    return process_action_input(executive_id, text, db, "Text", timezone=x_timezone or "UTC")

@app.post("/api/action/create", response_model=ActionItemResponse)
def create_action(req: CreateActionRequest, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db), x_timezone: Optional[str] = Header(None)):
    """
    Directly creates an action card, e.g. after the user resolves missing details.
    """
    verify_user_workspace_access(current_user, req.executive_id, db, require_write=True)
    # Note: We no longer schedule a tentative slot/soft-lock during pending action item creation.
    # The meeting will only be created on the calendar once manually approved.

    new_action = ActionItemDB(
        id=f"act_{uuid.uuid4().hex[:8]}",
        type=req.type,
        title=req.title,
        description=req.description,
        time_proposed=req.time_proposed,
        recipient=req.recipient,
        status="pending",
        executive_id=req.executive_id
    )
    db.add(new_action)
    db.commit()
    db.refresh(new_action)
    return new_action

@app.post("/api/action/approve")
def approve_action(action_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db), x_timezone: Optional[str] = Header(None)):
    """
    Executes and confirms the action item (e.g. finalizes calendar hold, sends email draft).
    """
    action = db.query(ActionItemDB).filter_by(id=action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found.")

    verify_user_workspace_access(current_user, action.executive_id, db, require_write=True)
    action.status = "approved"

    # If it was a calendar action, schedule the meeting in the calendar now!
    if action.type == "calendar":
        if "Calendar Hold Ref: " in action.description:
            try:
                hold_ref = action.description.split("Calendar Hold Ref: ")[1].split(")")[0]
                CalendarService.finalize_event(db, action.executive_id, hold_ref)
            except Exception:
                pass
        else:
            # Create a confirmed event directly on Google Calendar
            try:
                res = CalendarService.create_event(
                    db=db,
                    executive_id=action.executive_id,
                    title=action.title,
                    description=action.description,
                    start_time=action.time_proposed,
                    recipient=action.recipient,
                    timezone=x_timezone or "UTC",
                    status="confirmed"
                )
                action.description += f" (Confirmed Ref: {res['event_id']})"
                if res.get("meet_link"):
                    action.description += f" (Google Meet: {res['meet_link']})"
            except Exception as e:
                import traceback
                print(f"Error creating calendar event on approval: {e}\n{traceback.format_exc()}")

    # If it was an email action, send the email now!
    elif action.type == "email":
        if action.recipient:
            try:
                from email_service import EmailService
                # Clean prefix from description if present
                email_body = action.description
                for prefix in ["Voice Input: ", "Text Input: "]:
                    if email_body.startswith(prefix):
                        email_body = email_body[len(prefix):]
                
                res = EmailService.send_email(
                    db=db,
                    executive_id=action.executive_id,
                    recipient=action.recipient,
                    subject=action.title,
                    body=email_body
                )
                action.description += f" (Sent Ref: {res['message_id']})"
            except Exception as e:
                import traceback
                print(f"Error sending email on approval: {e}\n{traceback.format_exc()}")
        else:
            raise HTTPException(status_code=400, detail="Cannot approve email action: recipient email is missing.")

    db.commit()
    log_activity(db, current_user.id, "action_approve", f"Approved and executed {action.type} action: '{action.title}' for executive workspace {action.executive_id}.")
    return {"status": "success", "message": f"Action '{action.title}' approved & executed."}

@app.post("/api/action/reject")
def reject_action(action_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Rejects the action card and releases any calendar holds.
    """
    action = db.query(ActionItemDB).filter_by(id=action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found.")

    verify_user_workspace_access(current_user, action.executive_id, db, require_write=True)
    action.status = "rejected"

    # Release calendar hold
    if action.type == "calendar" and "Calendar Hold Ref: " in action.description:
        try:
            hold_ref = action.description.split("Calendar Hold Ref: ")[1].split(")")[0]
            CalendarService.release_soft_lock(db, action.executive_id, hold_ref)
        except Exception:
            pass

    db.commit()
    log_activity(db, current_user.id, "action_reject", f"Rejected {action.type} action: '{action.title}' for executive workspace {action.executive_id}.")
    return {"status": "success", "message": f"Action '{action.title}' rejected."}

# OAuth Integration Routes

@app.get("/api/auth/status")
def get_auth_status(executive_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Checks connection status for Google Calendar integration.
    """
    verify_user_workspace_access(current_user, executive_id, db)
    google_token = db.query(OAuthTokenDB).filter_by(executive_id=executive_id, provider="google").first()
    
    has_google = False
    if google_token is not None:
        if google_token.access_token.startswith("mock_"):
            has_google = True
        else:
            # Check if credentials can be built/refreshed
            creds = CalendarService.get_google_creds(db, executive_id)
            if creds is not None:
                has_google = True
            else:
                # Token is invalid or unrefreshable (e.g. client ID changed).
                # Remove it so the user can re-sync.
                db.delete(google_token)
                db.commit()
    
    return {
        "google_connected": has_google,
        "google_email": "Connected" if has_google else "Disconnected"
    }

@app.post("/api/auth/disconnect")
def disconnect_auth(executive_id: str, provider: str = "google", current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Deletes the OAuth token for a specific executive and provider to disconnect sync.
    """
    verify_user_workspace_access(current_user, executive_id, db, require_write=True)
    token_entry = db.query(OAuthTokenDB).filter_by(executive_id=executive_id, provider=provider).first()
    if token_entry:
        db.delete(token_entry)
        db.commit()
        log_activity(db, current_user.id, "oauth_disconnect", f"Disconnected {provider} integration for executive workspace {executive_id}.")
        return {"status": "success", "message": f"{provider.capitalize()} integration disconnected."}
    raise HTTPException(status_code=404, detail="Integration not found or already disconnected.")

@app.get("/api/auth/{provider}/url")
def get_auth_url(provider: str, executive_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db), referer: Optional[str] = Header(None)):
    """
    Generates OAuth login URL for calendar integrations, passing the referer origin in state.
    """
    verify_user_workspace_access(current_user, executive_id, db, require_write=True)
    try:
        # Determine frontend origin from referer header
        frontend_url = "http://127.0.0.1:3000"
        if referer:
            from urllib.parse import urlparse
            parsed = urlparse(referer)
            frontend_url = f"{parsed.scheme}://{parsed.netloc}"
            
        # Combine executive_id and frontend_url in state
        state = f"{executive_id}|{frontend_url}"
        
        url = CalendarService.get_auth_url(provider, state)
        return {"url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/auth/{provider}/callback")
def auth_callback(provider: str, code: str, state: str, db: Session = Depends(get_db)):
    """
    OAuth Callback handler that exchanges credentials, logs tokens, and redirects back to frontend dashboard.
    """
    try:
        # State can be "executive_id" or "executive_id|frontend_url"
        executive_id = state
        frontend_url = None
        if "|" in state:
            parts = state.split("|", 1)
            executive_id = parts[0]
            frontend_url = parts[1]
            
        CalendarService.handle_oauth_callback(db, provider, code, executive_id)
        log_activity(db, None, "oauth_sync", f"Successfully synced {provider} credentials for workspace {executive_id}.")
        
        # Fallback redirect if referer origin wasn't present
        if not frontend_url:
            frontend_url = os.environ.get("FRONTEND_URL", "http://127.0.0.1:3000")
            
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=frontend_url)
    except Exception as e:
        import traceback
        err_msg = f"Error in callback: {e}\n{traceback.format_exc()}"
        print(err_msg)
        return JSONResponse(status_code=500, content={"detail": err_msg})


# ==========================================
# ADMIN PANEL API ENDPOINTS
# ==========================================

@app.get("/api/admin/users", response_model=List[AdminUserResponse])
def admin_get_users(admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    users = db.query(UserDB).all()
    results = []
    for u in users:
        # get allowed executives
        owned = db.query(ExecutiveDB.id).filter(ExecutiveDB.owner_id == u.id).all()
        owned_ids = [o[0] for o in owned]
        mappings = db.query(UserWorkspaceDB.executive_id).filter(UserWorkspaceDB.user_id == u.id).all()
        mapped_ids = [m[0] for m in mappings]
        allowed_executives = list(set(owned_ids + mapped_ids))
        results.append({
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "role": u.role,
            "allowed_executives": allowed_executives
        })
    return results

@app.post("/api/admin/users", response_model=AdminUserResponse)
def admin_create_user(req: AdminUserCreateRequest, admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    existing = db.query(UserDB).filter_by(email=email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered.")
    
    new_user = UserDB(
        id=f"user_{uuid.uuid4().hex[:8]}",
        email=email,
        hashed_password=hash_password(req.password),
        name=req.name,
        role=req.role
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    log_activity(db, admin.id, "user_create", f"Admin created user: {new_user.name} ({new_user.email}) with role {new_user.role}.")
    return {
        "id": new_user.id,
        "email": new_user.email,
        "name": new_user.name,
        "role": new_user.role,
        "allowed_executives": []
    }

@app.put("/api/admin/users/{user_id}", response_model=AdminUserResponse)
def admin_update_user(user_id: str, req: AdminUserUpdateRequest, admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    user = db.query(UserDB).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    email = req.email.strip().lower()
    existing = db.query(UserDB).filter(UserDB.email == email, UserDB.id != user_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered by another user.")
        
    user.email = email
    user.name = req.name
    user.role = req.role
    if req.password and req.password.strip():
        user.hashed_password = hash_password(req.password)
        
    db.commit()
    log_activity(db, admin.id, "user_update", f"Admin updated user details for: {user.name} ({user.email}).")
    
    owned = db.query(ExecutiveDB.id).filter(ExecutiveDB.owner_id == user.id).all()
    owned_ids = [o[0] for o in owned]
    mappings = db.query(UserWorkspaceDB.executive_id).filter(UserWorkspaceDB.user_id == user.id).all()
    mapped_ids = [m[0] for m in mappings]
    allowed_executives = list(set(owned_ids + mapped_ids))
    
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "allowed_executives": allowed_executives
    }

@app.delete("/api/admin/users/{user_id}")
def admin_delete_user(user_id: str, admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Admin cannot delete their own account.")
        
    user = db.query(UserDB).filter_by(id=user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
        
    user_name = user.name
    user_email = user.email
    db.delete(user)
    db.commit()
    log_activity(db, admin.id, "user_delete", f"Admin deleted user account: {user_name} ({user_email}).")
    return {"status": "success", "message": f"User '{user_name}' deleted successfully."}

@app.get("/api/admin/workspaces", response_model=List[AdminWorkspaceResponse])
def admin_get_workspaces(admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    workspaces = db.query(ExecutiveDB).all()
    results = []
    for w in workspaces:
        owner = db.query(UserDB).filter_by(id=w.owner_id).first() if w.owner_id else None
        mapped_count = db.query(UserWorkspaceDB).filter_by(executive_id=w.id).count()
        results.append({
            "id": w.id,
            "name": w.name,
            "role": w.role,
            "email": w.email,
            "avatar": w.avatar,
            "owner_id": w.owner_id,
            "owner_name": owner.name if owner else None,
            "mapped_users_count": mapped_count
        })
    return results

@app.post("/api/admin/workspaces", response_model=AdminWorkspaceResponse)
def admin_create_workspace(req: AdminWorkspaceCreateRequest, admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    email = req.email.strip().lower()
    existing = db.query(ExecutiveDB).filter_by(email=email).first()
    if existing:
        raise HTTPException(status_code=400, detail="A workspace with this email already exists.")
        
    new_workspace = ExecutiveDB(
        id=f"exec_{uuid.uuid4().hex[:8]}",
        name=req.name,
        role=req.role,
        email=email,
        avatar=req.avatar or "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150",
        owner_id=req.owner_id
    )
    db.add(new_workspace)
    db.commit()
    db.refresh(new_workspace)
    
    owner = db.query(UserDB).filter_by(id=req.owner_id).first() if req.owner_id else None
    log_activity(db, admin.id, "workspace_create", f"Admin created workspace: '{new_workspace.name}' (assigned owner: {owner.name if owner else 'None'}).")
    
    return {
        "id": new_workspace.id,
        "name": new_workspace.name,
        "role": new_workspace.role,
        "email": new_workspace.email,
        "avatar": new_workspace.avatar,
        "owner_id": new_workspace.owner_id,
        "owner_name": owner.name if owner else None,
        "mapped_users_count": 0
    }

@app.put("/api/admin/workspaces/{workspace_id}", response_model=AdminWorkspaceResponse)
def admin_update_workspace(workspace_id: str, req: AdminWorkspaceUpdateRequest, admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    workspace = db.query(ExecutiveDB).filter_by(id=workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
        
    email = req.email.strip().lower()
    existing = db.query(ExecutiveDB).filter(ExecutiveDB.email == email, ExecutiveDB.id != workspace_id).first()
    if existing:
        raise HTTPException(status_code=400, detail="A workspace with this email address already exists.")
        
    workspace.name = req.name
    workspace.role = req.role
    workspace.email = email
    if req.avatar:
        workspace.avatar = req.avatar
    workspace.owner_id = req.owner_id
    
    db.commit()
    owner = db.query(UserDB).filter_by(id=req.owner_id).first() if req.owner_id else None
    log_activity(db, admin.id, "workspace_update", f"Admin updated workspace '{workspace.name}' (owner: {owner.name if owner else 'None'}).")
    
    mapped_count = db.query(UserWorkspaceDB).filter_by(executive_id=workspace_id).count()
    return {
        "id": workspace.id,
        "name": workspace.name,
        "role": workspace.role,
        "email": workspace.email,
        "avatar": workspace.avatar,
        "owner_id": workspace.owner_id,
        "owner_name": owner.name if owner else None,
        "mapped_users_count": mapped_count
    }

@app.delete("/api/admin/workspaces/{workspace_id}")
def admin_delete_workspace(workspace_id: str, admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    workspace = db.query(ExecutiveDB).filter_by(id=workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
        
    workspace_name = workspace.name
    workspace_email = workspace.email
    db.delete(workspace)
    db.commit()
    log_activity(db, admin.id, "workspace_delete", f"Admin deleted workspace '{workspace_name}' ({workspace_email}).")
    return {"status": "success", "message": f"Workspace '{workspace_name}' deleted successfully."}

@app.get("/api/admin/workspaces/{workspace_id}/users", response_model=List[str])
def admin_get_workspace_users(workspace_id: str, admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    mappings = db.query(UserWorkspaceDB.user_id).filter_by(executive_id=workspace_id).all()
    return [m[0] for m in mappings]

@app.post("/api/admin/workspaces/{workspace_id}/users")
def admin_set_workspace_users(workspace_id: str, req: AdminWorkspaceUsersRequest, admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    workspace = db.query(ExecutiveDB).filter_by(id=workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
        
    # Delete existing mappings
    db.query(UserWorkspaceDB).filter_by(executive_id=workspace_id).delete()
    
    # Create new mappings
    new_mappings = []
    for u_id in req.user_ids:
        # Verify user exists
        usr = db.query(UserDB).filter_by(id=u_id).first()
        if usr:
            new_mappings.append(UserWorkspaceDB(
                id=f"map_{uuid.uuid4().hex[:8]}",
                user_id=u_id,
                executive_id=workspace_id
            ))
    db.add_all(new_mappings)
    db.commit()
    log_activity(db, admin.id, "workspace_users_update", f"Admin updated mapped users access for workspace '{workspace.name}'. Total mapped: {len(new_mappings)}.")
    return {"status": "success", "message": f"Successfully mapped {len(new_mappings)} users to workspace '{workspace.name}'."}

@app.get("/api/admin/logs", response_model=List[AdminLogResponse])
def admin_get_logs(admin: UserDB = Depends(get_current_admin), db: Session = Depends(get_db)):
    logs = db.query(ActivityLogDB).order_by(ActivityLogDB.created_at.desc()).all()
    results = []
    for log in logs:
        user = db.query(UserDB).filter_by(id=log.user_id).first() if log.user_id else None
        results.append({
            "id": log.id,
            "user_id": log.user_id,
            "user_name": user.name if user else "System",
            "user_email": user.email if user else None,
            "action_type": log.action_type,
            "description": log.description,
            "created_at": log.created_at
        })
    return results
