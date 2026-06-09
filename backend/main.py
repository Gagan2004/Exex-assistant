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

from database import get_db, init_db, ExecutiveDB, ActionItemDB, OAuthTokenDB, UserDB, UserWorkspaceDB, verify_password, hash_password
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

def verify_user_workspace_access(user: UserDB, executive_id: str, db: Session):
    workspace = db.query(ExecutiveDB).filter_by(id=executive_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if workspace.owner_id == user.id:
        return
    access = db.query(UserWorkspaceDB).filter_by(user_id=user.id, executive_id=executive_id).first()
    if not access:
        raise HTTPException(
            status_code=403,
            detail=f"Access denied: User does not have permission to manage workspace {executive_id}"
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
    
    token = create_access_token({"sub": new_user.id, "email": new_user.email, "role": new_user.role})
    return {
        "token": token,
        "user": {
            "id": new_user.id,
            "email": new_user.email,
            "name": new_user.name,
            "role": new_user.role,
            "allowed_executives": []
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
    return new_workspace

@app.delete("/api/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    workspace = db.query(ExecutiveDB).filter_by(id=workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Workspace not found.")
        
    if workspace.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the owner of this workspace can delete it.")
        
    db.delete(workspace)
    db.commit()
    return {"status": "success", "message": f"Workspace '{workspace.name}' successfully deleted."}

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
    verify_user_workspace_access(current_user, executive_id, db)
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
    verify_user_workspace_access(current_user, executive_id, db)
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
    verify_user_workspace_access(current_user, req.executive_id, db)
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

    verify_user_workspace_access(current_user, action.executive_id, db)
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
    return {"status": "success", "message": f"Action '{action.title}' approved & executed."}

@app.post("/api/action/reject")
def reject_action(action_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Rejects the action card and releases any calendar holds.
    """
    action = db.query(ActionItemDB).filter_by(id=action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found.")

    verify_user_workspace_access(current_user, action.executive_id, db)
    action.status = "rejected"

    # Release calendar hold
    if action.type == "calendar" and "Calendar Hold Ref: " in action.description:
        try:
            hold_ref = action.description.split("Calendar Hold Ref: ")[1].split(")")[0]
            CalendarService.release_soft_lock(db, action.executive_id, hold_ref)
        except Exception:
            pass

    db.commit()
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
    verify_user_workspace_access(current_user, executive_id, db)
    token_entry = db.query(OAuthTokenDB).filter_by(executive_id=executive_id, provider=provider).first()
    if token_entry:
        db.delete(token_entry)
        db.commit()
        return {"status": "success", "message": f"{provider.capitalize()} integration disconnected."}
    raise HTTPException(status_code=404, detail="Integration not found or already disconnected.")

@app.get("/api/auth/{provider}/url")
def get_auth_url(provider: str, executive_id: str, current_user: UserDB = Depends(get_current_user), db: Session = Depends(get_db), referer: Optional[str] = Header(None)):
    """
    Generates OAuth login URL for calendar integrations, passing the referer origin in state.
    """
    verify_user_workspace_access(current_user, executive_id, db)
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
