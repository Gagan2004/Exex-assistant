import logging
import base64
from email.mime.text import MIMEText
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session
from googleapiclient.discovery import build
from calendar_service import CalendarService

logger = logging.getLogger("assistant_bot.email")

class EmailService:
    @staticmethod
    def send_email(db: Session, executive_id: str, recipient: str, subject: str, body: str) -> Dict[str, Any]:
        """
        Sends an email using the Executive's OAuth Gmail connection.
        Falls back to mock sandbox if not connected or if request fails.
        """
        logger.info(f"Preparing to send email to {recipient} on behalf of {executive_id}")
        
        # Try Google API
        creds = CalendarService.get_google_creds(db, executive_id)
        if creds:
            try:
                service = build('gmail', 'v1', credentials=creds)
                
                # Retrieve executive email for the 'From' address
                from database import ExecutiveDB
                exec_db = db.query(ExecutiveDB).filter_by(id=executive_id).first()
                sender = exec_db.email if exec_db else "me"

                # Construct MIME message
                message = MIMEText(body)
                message['to'] = recipient
                message['from'] = sender
                message['subject'] = subject
                
                # Base64 urlsafe encode the raw bytes
                raw = base64.urlsafe_b64encode(message.as_bytes()).decode('utf-8')
                raw_payload = {'raw': raw}
                
                # Send email via Gmail API
                sent_msg = service.users().messages().send(userId="me", body=raw_payload).execute()
                logger.info(f"Gmail message sent successfully! ID: {sent_msg.get('id')}")
                
                return {
                    "status": "sent",
                    "provider_notified": "gmail",
                    "message_id": sent_msg.get('id'),
                    "recipient": recipient,
                    "subject": subject
                }
            except Exception as e:
                logger.error(f"Error calling Gmail API to send email: {e}")

        # Fallback mock sandbox
        logger.info("Gmail API unavailable or failed. Falling back to sandbox.")
        print("======== SANDBOX EMAIL SENT ========")
        print(f"To: {recipient}")
        print(f"Subject: {subject}")
        print(f"Body:\n{body}")
        print("====================================")
        
        return {
            "status": "sent",
            "provider_notified": "gmail_sandbox",
            "message_id": f"msg_mock_{executive_id}_{recipient[:5]}",
            "recipient": recipient,
            "subject": subject
        }
