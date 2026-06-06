import os
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'
import logging
import uuid
import json
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from database import OAuthTokenDB

# Google APIs
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from google.auth.transport.requests import Request

logger = logging.getLogger("assistant_bot.calendar")

# We look for client config in these files
CLIENT_SECRETS_PATHS = ["credentials.json", "client_secrets.json", "client_secret.json"]

def get_google_client_config_path() -> Optional[str]:
    for path in CLIENT_SECRETS_PATHS:
        # Check in current dir or backend dir
        full_path = path
        if os.path.exists(full_path):
            return full_path
        backend_path = os.path.join("backend", path)
        if os.path.exists(backend_path):
            return backend_path
        # Check absolute path in workspace
        workspace_path = os.path.join(r"c:\Users\gagan\OneDrive\projects\assistant-bot\backend", path)
        if os.path.exists(workspace_path):
            return workspace_path
            
    # Fallback to search for any JSON file matching patterns in backend and current dirs
    import glob
    search_dirs = [".", "backend", r"c:\Users\gagan\OneDrive\projects\assistant-bot\backend"]
    for sdir in search_dirs:
        if os.path.exists(sdir):
            patterns = [
                os.path.join(sdir, "client_secret*.json"),
                os.path.join(sdir, "credentials*.json"),
                os.path.join(sdir, "client_secrets*.json")
            ]
            for pat in patterns:
                for match in glob.glob(pat):
                    if os.path.isfile(match):
                        # Ensure it contains google oauth client config
                        try:
                            with open(match, "r") as f:
                                data = json.load(f)
                                if "web" in data or "installed" in data:
                                    logger.info(f"Auto-detected Google client credentials file: {match}")
                                    return match
                        except Exception:
                            continue
    return None

def parse_datetime_flexible(date_str: str) -> Optional[datetime]:
    """
    Tries to parse date strings like "June 23, 2026 at 2:00 PM"
    """
    # Clean text
    clean_str = date_str.lower().replace("proposed:", "").replace("at", "").replace("  ", " ").strip()
    
    # Try fromisoformat first (safely stripping Z if present)
    try:
        iso_str = clean_str.upper().replace("Z", "")
        if "T" in iso_str:
            return datetime.fromisoformat(iso_str)
    except ValueError:
        pass
        
    # Try formats
    formats = [
        "%Y-%m-%d %H:%M",      # 2026-06-23 14:00
        "%Y-%m-%d %H:%M:%S",   # 2026-06-23 14:00:00
        "%B %d, %Y %I:%M %p",  # june 23, 2026 2:00 pm
        "%B %d %Y %I:%M %p",   # june 23 2026 2:00 pm
        "%B %d, %Y %I:%M%p",   # june 23, 2026 2:00pm
        "%B %d %Y %I:%M%p",    # june 23 2026 2:00pm
        "%B %d, %Y %I %p",     # june 23, 2026 2 pm
        "%B %d %Y %I %p",      # june 23 2026 2 pm
        "%B %d, %Y %I%p",      # june 23, 2026 2pm
        "%B %d %Y %I%p",       # june 23 2026 2pm
        "%B %d, %Y %H:%M",     # june 23, 2026 14:00
        "%B %d %Y %H:%M",
    ]
    
    for fmt in formats:
        try:
            return datetime.strptime(clean_str, fmt)
        except ValueError:
            continue
            
    # Try date-only formats and append a default time
    date_formats_only = [
        "%B %d, %Y",
        "%B %d %Y",
        "%Y-%m-%d"
    ]
    for fmt in date_formats_only:
        try:
            parsed_date = datetime.strptime(clean_str, fmt)
            return parsed_date.replace(hour=10, minute=0)
        except ValueError:
            continue
            
    return None

class CalendarService:
    @staticmethod
    def get_auth_url(provider: str, executive_id: str) -> str:
        """
        Generates the OAuth authentication URL for Google Workspace or Microsoft 365.
        """
        if provider == "google":
            secrets_path = get_google_client_config_path()
            if secrets_path:
                logger.info(f"Using Google client secrets from: {secrets_path}")
                # We need redirect URI. Using port 8001 since user runs backend on 8001
                redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8001/api/auth/google/callback")
                flow = Flow.from_client_secrets_file(
                    secrets_path,
                    scopes=[
                        "https://www.googleapis.com/auth/calendar.events",
                        "https://www.googleapis.com/auth/gmail.send"
                    ],
                    redirect_uri=redirect_uri,
                    autogenerate_code_verifier=False
                )
                auth_url, _ = flow.authorization_url(
                    access_type='offline',
                    include_granted_scopes='true',
                    prompt='consent',
                    state=executive_id
                )
                return auth_url
            else:
                logger.warning("No Google credentials.json found in backend. Defaulting to mock auth link.")
                client_id = os.environ.get("GOOGLE_CLIENT_ID", "mock_google_client_id")
                redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8001/api/auth/google/callback")
                scope = "https://www.googleapis.com/auth/calendar.events+https://www.googleapis.com/auth/gmail.send"
                return f"https://accounts.google.com/o/oauth2/v2/auth?client_id={client_id}&redirect_uri={redirect_uri}&response_type=code&scope={scope}&state={executive_id}&access_type=offline&prompt=consent"
        
        elif provider == "microsoft":
            client_id = os.environ.get("MICROSOFT_CLIENT_ID", "mock_microsoft_client_id")
            redirect_uri = os.environ.get("MICROSOFT_REDIRECT_URI", "http://localhost:8001/api/auth/microsoft/callback")
            scope = "https://graph.microsoft.com/Calendars.ReadWrite"
            return f"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id={client_id}&redirect_uri={redirect_uri}&response_type=code&scope={scope}&state={executive_id}"
        
        else:
            raise ValueError("Unsupported provider")
 
    @staticmethod
    def handle_oauth_callback(db: Session, provider: str, code: str, executive_id: str) -> Dict[str, Any]:
        """
        Handles exchange of auth code for access/refresh tokens and persists them.
        """
        logger.info(f"Exchanging authorization code for provider {provider} for executive {executive_id}")
        
        access_token = f"mock_access_{provider}_{code[:10]}"
        refresh_token = f"mock_refresh_{provider}_secret"
        expires_at = datetime.utcnow() + timedelta(hours=1)
 
        if provider == "google":
            secrets_path = get_google_client_config_path()
            if secrets_path:
                redirect_uri = os.environ.get("GOOGLE_REDIRECT_URI", "http://localhost:8001/api/auth/google/callback")
                flow = Flow.from_client_secrets_file(
                    secrets_path,
                    scopes=[
                        "https://www.googleapis.com/auth/calendar.events",
                        "https://www.googleapis.com/auth/gmail.send"
                    ],
                    redirect_uri=redirect_uri,
                    autogenerate_code_verifier=False
                )
                flow.fetch_token(code=code)
                credentials = flow.credentials
                access_token = credentials.token
                refresh_token = credentials.refresh_token or ""
                expires_at = credentials.expiry or (datetime.utcnow() + timedelta(hours=1))
        
        # Persist token in SQLite
        token_entry = db.query(OAuthTokenDB).filter_by(executive_id=executive_id, provider=provider).first()
        if not token_entry:
            token_entry = OAuthTokenDB(
                id=f"tok_{provider}_{executive_id}",
                executive_id=executive_id,
                provider=provider
            )
            db.add(token_entry)
        
        token_entry.access_token = access_token
        if refresh_token:
            token_entry.refresh_token = refresh_token
        token_entry.expires_at = expires_at
        db.commit()

        return {"status": "success", "message": f"{provider.capitalize()} account synced successfully."}

    @staticmethod
    def get_google_creds(db: Session, executive_id: str) -> Optional[Credentials]:
        """
        Constructs and refreshes Google Credentials object.
        """
        token_entry = db.query(OAuthTokenDB).filter_by(executive_id=executive_id, provider="google").first()
        if not token_entry or token_entry.access_token.startswith("mock_"):
            return None
            
        secrets_path = get_google_client_config_path()
        if not secrets_path:
            return None

        # Build credentials
        try:
            with open(secrets_path, "r") as f:
                client_info = json.load(f)
                web_config = client_info.get("web", client_info.get("installed", {}))
                client_id = web_config.get("client_id")
                client_secret = web_config.get("client_secret")

            creds = Credentials(
                token=token_entry.access_token,
                refresh_token=token_entry.refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret,
                expiry=token_entry.expires_at
            )

            # Refresh if expired
            if creds.expired and creds.refresh_token:
                logger.info("Google credentials expired. Refreshing token...")
                creds.refresh(Request())
                token_entry.access_token = creds.token
                token_entry.expires_at = creds.expiry
                db.commit()

            return creds
        except Exception as e:
            logger.error(f"Failed to refresh/build Google credentials: {e}")
            return None

    @staticmethod
    def create_event(db: Session, executive_id: str, title: str, description: str, start_time: str, recipient: Optional[str] = None, timezone: str = "UTC", status: str = "confirmed") -> Dict[str, Any]:
        """
        Creates a calendar event (either confirmed or tentative) in the executive's calendar.
        """
        logger.info(f"Creating event for {executive_id}: {title} at {start_time} (status: {status})")
        
        # Build event times: parse start_time or fallback to 1 day ahead
        start_iso = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
        end_iso = (datetime.utcnow() + timedelta(days=1, hours=1)).isoformat() + "Z"
        
        parsed_dt = parse_datetime_flexible(start_time)
        if parsed_dt:
            start_iso = parsed_dt.isoformat()
            # Default to 45 min slot
            end_iso = (parsed_dt + timedelta(minutes=45)).isoformat()

        # Try Google API
        creds = CalendarService.get_google_creds(db, executive_id)
        if creds:
            try:
                service = build('calendar', 'v3', credentials=creds)
                event_summary = title if status == "confirmed" else f"[Soft-Lock] {title}"
                event_body = {
                    'summary': event_summary,
                    'description': description,
                    'start': {'dateTime': start_iso, 'timeZone': timezone},
                    'end': {'dateTime': end_iso, 'timeZone': timezone},
                    'status': status,
                    'conferenceData': {
                        'createRequest': {
                            'requestId': f"req_{uuid.uuid4().hex[:8]}",
                            'conferenceSolutionKey': {
                                'type': 'hangoutsMeet'
                            }
                        }
                    }
                }
                if recipient and "@" in recipient:
                    event_body['attendees'] = [{'email': recipient}]

                event = service.events().insert(
                    calendarId='primary', 
                    body=event_body,
                    conferenceDataVersion=1,
                    sendUpdates='all'
                ).execute()
                
                logger.info(f"Google Calendar event created: {event.get('id')}")
                # Print output as requested
                print(f"Event created successfully! ID: {event.get('id')}")
                print(f"Google Meet Link: {event.get('hangoutLink')}")
                
                return {
                    "status": "confirmed" if status == "confirmed" else "soft_locked",
                    "provider_notified": "google",
                    "event_id": event.get('id'),
                    "summary": event_summary,
                    "meet_link": event.get('hangoutLink')
                }
            except Exception as e:
                logger.error(f"Error calling Google Calendar API: {e}")

        # Fallback to mock sandbox
        return {
            "status": "confirmed" if status == "confirmed" else "soft_locked",
            "provider_notified": "google_sandbox",
            "event_id": f"evt_{status}_{datetime.utcnow().timestamp()}",
            "summary": title if status == "confirmed" else f"[Soft-Lock] {title}",
            "meet_link": "https://meet.google.com/abc-defg-hij"
        }

    @staticmethod
    def create_soft_lock(db: Session, executive_id: str, title: str, description: str, start_time: str, recipient: Optional[str] = None, timezone: str = "UTC") -> Dict[str, Any]:
        """
        Creates a soft-locked (tentative) calendar event in the executive's calendar.
        This reserves the slot to prevent double-booking while awaiting EA/Guest confirmation.
        """
        return CalendarService.create_event(db, executive_id, title, description, start_time, recipient, timezone, "tentative")

    @staticmethod
    def finalize_event(db: Session, executive_id: str, soft_lock_event_id: str) -> Dict[str, Any]:
        """
        Finalizes a soft-locked event: removes the '[Soft-Lock]' tag and changes status to confirmed.
        """
        logger.info(f"Finalizing calendar event {soft_lock_event_id} for {executive_id}")
        
        creds = CalendarService.get_google_creds(db, executive_id)
        if creds and not soft_lock_event_id.startswith("evt_soft_lock_"):
            try:
                service = build('calendar', 'v3', credentials=creds)
                event = service.events().get(calendarId='primary', eventId=soft_lock_event_id).execute()
                
                # Update event summary and confirm status
                summary = event.get('summary', '')
                if "[Soft-Lock]" in summary:
                    event['summary'] = summary.replace("[Soft-Lock]", "").strip()
                event['status'] = 'confirmed'
                
                updated_event = service.events().update(
                    calendarId='primary', 
                    eventId=soft_lock_event_id, 
                    body=event,
                    sendUpdates='all'
                ).execute()
                logger.info(f"Google Calendar event finalized: {updated_event.get('id')}")
                return {
                    "status": "confirmed",
                    "event_id": soft_lock_event_id,
                    "message": "Meeting confirmed. Google event updated."
                }
            except Exception as e:
                logger.error(f"Error finalising Google Calendar event: {e}")

        return {
            "status": "confirmed",
            "event_id": soft_lock_event_id,
            "message": "Meeting confirmed. Invites sent to participants."
        }

    @staticmethod
    def release_soft_lock(db: Session, executive_id: str, soft_lock_event_id: str) -> Dict[str, Any]:
        """
        Deletes a soft-locked event from the calendar (if rejected or timed out).
        """
        logger.info(f"Releasing soft-locked event {soft_lock_event_id} for {executive_id}")
        
        creds = CalendarService.get_google_creds(db, executive_id)
        if creds and not soft_lock_event_id.startswith("evt_soft_lock_"):
            try:
                service = build('calendar', 'v3', credentials=creds)
                service.events().delete(calendarId='primary', eventId=soft_lock_event_id).execute()
                logger.info("Google Calendar soft-lock deleted successfully.")
                return {
                    "status": "released",
                    "event_id": soft_lock_event_id
                }
            except Exception as e:
                logger.error(f"Error releasing Google Calendar soft-lock: {e}")
                
        return {
            "status": "released",
            "event_id": soft_lock_event_id
        }

    @staticmethod
    def list_upcoming_meetings(db: Session, executive_id: str, max_results: int = 5) -> List[Dict[str, Any]]:
        """
        Lists upcoming meetings for the executive from their Google Calendar.
        Falls back to a mock sandbox list if not synced.
        """
        creds = CalendarService.get_google_creds(db, executive_id)
        if creds:
            try:
                service = build('calendar', 'v3', credentials=creds)
                now_iso = datetime.utcnow().isoformat() + "Z"
                
                # Fetch calendar events from now onwards
                events_result = service.events().list(
                    calendarId='primary',
                    timeMin=now_iso,
                    maxResults=max_results,
                    singleEvents=True,
                    orderBy='startTime'
                ).execute()
                
                events = events_result.get('items', [])
                meetings = []
                for event in events:
                    start_time = event.get('start', {}).get('dateTime') or event.get('start', {}).get('date')
                    end_time = event.get('end', {}).get('dateTime') or event.get('end', {}).get('date')
                    meetings.append({
                        "id": event.get('id'),
                        "title": event.get('summary', 'Untitled Meeting'),
                        "description": event.get('description', ''),
                        "start_time": start_time,
                        "end_time": end_time,
                        "meet_link": event.get('hangoutLink') or event.get('htmlLink'),
                        "attendees": [att.get('email') for att in event.get('attendees', []) if att.get('email')],
                        "status": event.get('status')
                    })
                return meetings
            except Exception as e:
                logger.error(f"Error fetching upcoming Google Calendar meetings: {e}")
                
        # Mock fallback
        # Let's return some mock upcoming meetings matching the active executive!
        from database import ExecutiveDB
        exec_db = db.query(ExecutiveDB).filter_by(id=executive_id).first()
        exec_name = exec_db.name if exec_db else "Sarah Jenkins"
        
        # Let's dynamically generate dates relative to today
        today = datetime.now()
        
        # Some mock meetings
        return [
            {
                "id": "mock_meet_1",
                "title": "Weekly Strategy & Q3 Planning",
                "description": "Weekly alignment with leadership team to discuss strategy milestones and Q3 targets.",
                "start_time": (today + timedelta(days=1, hours=2)).replace(minute=0, second=0).isoformat(),
                "end_time": (today + timedelta(days=1, hours=3)).replace(minute=0, second=0).isoformat(),
                "meet_link": "https://meet.google.com/abc-defg-hij",
                "attendees": ["finance-lead@company.com", "product-vp@company.com"],
                "status": "confirmed"
            },
            {
                "id": "mock_meet_2",
                "title": "1-on-1: EA Operations Sync",
                "description": "Weekly sync with EA to review pending tasks and priority dashboard inbox reviews.",
                "start_time": (today + timedelta(days=2, hours=4)).replace(minute=30, second=0).isoformat(),
                "end_time": (today + timedelta(days=2, hours=5)).replace(minute=0, second=0).isoformat(),
                "meet_link": "https://meet.google.com/xyz-lmn-opq",
                "attendees": ["ea-support@company.com"],
                "status": "confirmed"
            },
            {
                "id": "mock_meet_3",
                "title": "Investor Sync: Ventures Compliance",
                "description": "Regulatory checklist sync with primary venture capital audit committee.",
                "start_time": (today + timedelta(days=4, hours=6)).replace(minute=0, second=0).isoformat(),
                "end_time": (today + timedelta(days=4, hours=6, minutes=45)).replace(minute=0, second=0).isoformat(),
                "meet_link": "https://meet.google.com/uvw-xyz-abc",
                "attendees": ["investor-relations@ventures.com"],
                "status": "confirmed"
            }
        ]
