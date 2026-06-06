import os
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv()
import uuid
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Depends, Query, Header

os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import get_db, init_db, ExecutiveDB, ActionItemDB, OAuthTokenDB
from agent import parse_voice_transcription
from calendar_service import CalendarService

# Initialize SQLite database on API start
init_db()

app = FastAPI(title="Executive AI Assistant Backend")

# Enable CORS for the frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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

    class Config:
        from_attributes = True

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

# API Endpoints

@app.get("/api/executives", response_model=List[ExecutiveResponse])
def get_executives(db: Session = Depends(get_db)):
    """
    List all registered executives (multi-tenant workspaces).
    """
    executives = db.query(ExecutiveDB).all()
    return executives

@app.get("/api/dashboard", response_model=List[ActionItemResponse])
def get_dashboard(executive_id: str, db: Session = Depends(get_db)):
    """
    Fetch all pending actions for a specific executive.
    """
    actions = db.query(ActionItemDB).filter(
        ActionItemDB.executive_id == executive_id,
        ActionItemDB.status == "pending"
    ).all()
    return actions

@app.get("/api/meetings")
def get_upcoming_meetings(executive_id: str, db: Session = Depends(get_db)):
    """
    Fetch upcoming meetings for a specific executive.
    """
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
def process_voice_action(executive_id: str, text: str, db: Session = Depends(get_db), x_timezone: Optional[str] = Header(None)):
    """
    Ingests voice transcription memo, validates calendar slots, and persists card.
    """
    exec_exists = db.query(ExecutiveDB).filter_by(id=executive_id).first()
    if not exec_exists:
        raise HTTPException(status_code=404, detail="Executive workspace not found")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Voice transcription text cannot be empty.")
        
    return process_action_input(executive_id, text, db, "Voice", timezone=x_timezone or "UTC")

@app.post("/api/text-action")
def process_text_action(executive_id: str, text: str, db: Session = Depends(get_db), x_timezone: Optional[str] = Header(None)):
    """
    Ingests typed directive text, validates calendar slots, and persists card.
    """
    exec_exists = db.query(ExecutiveDB).filter_by(id=executive_id).first()
    if not exec_exists:
        raise HTTPException(status_code=404, detail="Executive workspace not found")
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text directive cannot be empty.")
        
    return process_action_input(executive_id, text, db, "Text", timezone=x_timezone or "UTC")

@app.post("/api/action/create", response_model=ActionItemResponse)
def create_action(req: CreateActionRequest, db: Session = Depends(get_db), x_timezone: Optional[str] = Header(None)):
    """
    Directly creates an action card, e.g. after the user resolves missing details.
    """
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
def approve_action(action_id: str, db: Session = Depends(get_db), x_timezone: Optional[str] = Header(None)):
    """
    Executes and confirms the action item (e.g. finalizes calendar hold, sends email draft).
    """
    action = db.query(ActionItemDB).filter_by(id=action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found.")

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
def reject_action(action_id: str, db: Session = Depends(get_db)):
    """
    Rejects the action card and releases any calendar holds.
    """
    action = db.query(ActionItemDB).filter_by(id=action_id).first()
    if not action:
        raise HTTPException(status_code=404, detail="Action not found.")

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
def get_auth_status(executive_id: str, db: Session = Depends(get_db)):
    """
    Checks connection status for Google Calendar integration.
    """
    google_token = db.query(OAuthTokenDB).filter_by(executive_id=executive_id, provider="google").first()
    has_google = google_token is not None and not google_token.access_token.startswith("mock_")
    
    return {
        "google_connected": has_google,
        "google_email": "Connected" if has_google else "Disconnected"
    }

@app.get("/api/auth/{provider}/url")
def get_auth_url(provider: str, executive_id: str):
    """
    Generates OAuth login URL for calendar integrations.
    """
    try:
        url = CalendarService.get_auth_url(provider, executive_id)
        return {"url": url}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/auth/{provider}/callback")
def auth_callback(provider: str, code: str, state: str, db: Session = Depends(get_db)):
    """
    OAuth Callback handler that receives code and logs tokens in DB.
    """
    try:
        result = CalendarService.handle_oauth_callback(db, provider, code, state)
        return result
    except Exception as e:
        import traceback
        err_msg = f"Error in callback: {e}\n{traceback.format_exc()}"
        print(err_msg)
        return JSONResponse(status_code=500, content={"detail": err_msg})
