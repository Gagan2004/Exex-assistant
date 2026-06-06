import os
from datetime import datetime
from dotenv import load_dotenv
load_dotenv()
from sqlalchemy import create_engine, Column, String, DateTime, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./assistant_bot.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class ExecutiveDB(Base):
    __tablename__ = "executives"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    avatar = Column(String, nullable=True)
    email = Column(String, nullable=False, unique=True)

    actions = relationship("ActionItemDB", back_populates="executive", cascade="all, delete-orphan")
    tokens = relationship("OAuthTokenDB", back_populates="executive", cascade="all, delete-orphan")

class ActionItemDB(Base):
    __tablename__ = "action_items"

    id = Column(String, primary_key=True, index=True)
    type = Column(String, nullable=False)  # "calendar", "task", "email"
    title = Column(String, nullable=False)
    description = Column(String, nullable=False)
    time_proposed = Column(String, nullable=True)
    recipient = Column(String, nullable=True)
    status = Column(String, default="pending")  # "pending", "approved", "rejected"
    executive_id = Column(String, ForeignKey("executives.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    executive = relationship("ExecutiveDB", back_populates="actions")

class OAuthTokenDB(Base):
    __tablename__ = "oauth_tokens"

    id = Column(String, primary_key=True, index=True)
    executive_id = Column(String, ForeignKey("executives.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String, nullable=False)  # "google" or "microsoft"
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=True)

    executive = relationship("ExecutiveDB", back_populates="tokens")

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        # Seed executives if table is empty
        if db.query(ExecutiveDB).count() == 0:
            seed_executives = [
                ExecutiveDB(
                    id="exec_1", 
                    name="Sarah Jenkins", 
                    role="CEO", 
                    avatar="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150", 
                    email="sarah.j@company.com"
                ),
                ExecutiveDB(
                    id="exec_2", 
                    name="David Kross", 
                    role="CFO", 
                    avatar="https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150", 
                    email="david.k@company.com"
                ),
                ExecutiveDB(
                    id="exec_3", 
                    name="Elena Rostova", 
                    role="CTO", 
                    avatar="https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150", 
                    email="elena.r@company.com"
                ),
            ]
            db.add_all(seed_executives)
            db.commit()

        # Seed action items if table is empty
        if db.query(ActionItemDB).count() == 0:
            seed_actions = [
                ActionItemDB(
                    id="act_1",
                    type="calendar",
                    title="Schedule Q3 Board Prep",
                    description="30-minute sync with John (Investor) next Tuesday afternoon.",
                    time_proposed="Tuesday, June 9th at 2:00 PM - 2:30 PM",
                    recipient="john.investor@ventures.com",
                    status="pending",
                    executive_id="exec_1"
                ),
                ActionItemDB(
                    id="act_2",
                    type="email",
                    title="Draft Reply: Budget Adjustment",
                    description="Draft reply to Finance Committee confirming approval of the revised hiring budget.",
                    recipient="finance-committee@company.com",
                    status="pending",
                    executive_id="exec_2"
                ),
                ActionItemDB(
                    id="act_3",
                    type="task",
                    title="Follow Up on Architecture Review",
                    description="Remind security team to submit the compliance checklist by Friday.",
                    status="pending",
                    executive_id="exec_3"
                )
            ]
            db.add_all(seed_actions)
            db.commit()
    finally:
        db.close()
