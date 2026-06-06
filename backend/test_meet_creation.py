import datetime
import os
import json
import glob
import sys
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Add backend directory to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from database import get_db, OAuthTokenDB, ExecutiveDB
from calendar_service import CalendarService

# Define Permissions (Scopes) and Redirect URI fallback
SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
REDIRECT_URI = "http://localhost:8080/"

def find_client_secrets():
    patterns = [
        "client_secret*.json",
        "credentials*.json",
        "client_secrets*.json"
    ]
    for pat in patterns:
        for match in glob.glob(pat):
            if os.path.isfile(match):
                try:
                    with open(match, "r") as f:
                        data = json.load(f)
                        if "web" in data or "installed" in data:
                            return match
                except Exception:
                    continue
    return None

def main():
    creds = None
    
    # 1. Try to load the synced token from the local SQLite database
    try:
        db = next(get_db())
        token_entry = db.query(OAuthTokenDB).filter_by(provider="google").first()
        if token_entry and not token_entry.access_token.startswith("mock_"):
            print(f"Found active synced Google credentials in database for Executive ID: {token_entry.executive_id}")
            creds = CalendarService.get_google_creds(db, token_entry.executive_id)
    except Exception as db_err:
        print(f"Database lookup skipped/failed: {db_err}")
        
    # 2. Fallback to token.json file
    if not creds:
        token_path = 'token.json'
        if os.path.exists(token_path):
            print("Found token.json locally.")
            creds = Credentials.from_authorized_user_file(token_path, SCOPES)
            
    # 3. If no credentials, prompt the user
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            print("Refreshing expired credentials...")
            creds.refresh(Request())
        else:
            print("\n==================================================================")
            print("No valid Google credentials found.")
            print("To resolve redirect_uri_mismatch:")
            print("1. Start the backend and frontend servers.")
            print("2. Open http://localhost:3000 in your browser.")
            print("3. In the sidebar under 'System Preferences', click 'Sync' next to Google Calendar Sync.")
            print("4. Complete the login flow (which uses the authorized http://localhost:8001 redirect URI).")
            print("5. Once completed, re-run this script to automatically fetch and use the synced credentials.")
            print("==================================================================\n")
            
            choice = input("Would you like to try the fallback local server flow on port 8080 anyway? (y/n): ").strip().lower()
            if choice != 'y':
                return
                
            secrets_file = find_client_secrets()
            if not secrets_file:
                print("Error: No Google Client Secrets JSON file found in this directory!")
                return
                
            print(f"Using client secrets file: {secrets_file}")
            flow = InstalledAppFlow.from_client_secrets_file(
                secrets_file, SCOPES, redirect_uri=REDIRECT_URI
            )
            creds = flow.run_local_server(port=8080)
            
            with open('token.json', 'w') as token:
                token.write(creds.to_json())

    # Build the Calendar API Service
    service = build('calendar', 'v3', credentials=creds)

    # Define the Event (Scheduled for tomorrow)
    tomorrow = datetime.date.today() + datetime.timedelta(days=1)
    
    event_payload = {
      'summary': 'API Testing Event',
      'description': 'Checking if our Google Meet API integration works!',
      'start': {
        'dateTime': f'{tomorrow}T10:00:00',
        'timeZone': 'America/New_York', 
      },
      'end': {
        'dateTime': f'{tomorrow}T11:00:00',
        'timeZone': 'America/New_York',
      },
      'conferenceData': {
        'createRequest': {
          'requestId': 'secure-random-string-999999',
          'conferenceSolutionKey': {'type': 'hangoutsMeet'}
        }
      }
    }

    print("Sending request to Google Calendar...")
    
    # Execute the Insert Request
    created_event = service.events().insert(
        calendarId='primary', 
        body=event_payload,
        conferenceDataVersion=1 
    ).execute()

    print("\n=== VERIFICATION SUCCESSFUL ===")
    print(f"Event Created: {created_event.get('summary')}")
    print(f"Event ID:      {created_event.get('id')}")
    print(f"Meet Link URL: {created_event.get('hangoutLink')}")
    print("===============================\n")

    print("Full JSON response from Google API:")
    print(json.dumps(created_event, indent=2))

if __name__ == '__main__':
    main()
