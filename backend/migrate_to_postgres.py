import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add current dir to path to import local modules
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import Base, ExecutiveDB, ActionItemDB, OAuthTokenDB, UserDB, UserWorkspaceDB

def migrate():
    # 1. Connect to SQLite (source)
    sqlite_url = "sqlite:///./assistant_bot.db"
    if not os.path.exists("assistant_bot.db") and os.path.exists("backend/assistant_bot.db"):
        sqlite_url = "sqlite:///./backend/assistant_bot.db"
        
    print(f"[*] Connecting to source SQLite database: {sqlite_url}")
    sqlite_engine = create_engine(sqlite_url)
    SQLiteSession = sessionmaker(bind=sqlite_engine)
    sqlite_session = SQLiteSession()

    # 2. Get Postgres Connection URL (target)
    postgres_url = os.environ.get("DATABASE_URL")
    if not postgres_url:
        print("[!] DATABASE_URL environment variable not found.")
        postgres_url = input("[?] Enter your Supabase Postgres connection string (e.g. postgresql://user:pass@host:port/dbname): ").strip()
    
    if not postgres_url:
        print("[Error] No target connection string provided. Migration cancelled.")
        return

    # Handle standard Heroku/Supabase format conversion
    if postgres_url.startswith("postgres://"):
        postgres_url = postgres_url.replace("postgres://", "postgresql://", 1)

    print(f"[*] Connecting to target Postgres database...")
    try:
        postgres_engine = create_engine(postgres_url)
        PostgresSession = sessionmaker(bind=postgres_engine)
        postgres_session = PostgresSession()
        
        # Test connection
        connection = postgres_engine.connect()
        connection.close()
        print("[+] Postgres connection successful!")
    except Exception as e:
        print(f"[Error] Failed to connect to Postgres: {e}")
        return

    # 3. Create schemas in target Postgres
    print("[*] Initializing schemas in target Postgres database...")
    try:
        Base.metadata.create_all(bind=postgres_engine)
        print("[+] Schemas initialized successfully.")
    except Exception as e:
        print(f"[Error] Failed to create schemas: {e}")
        return

    # 4. Read data from SQLite and write to Postgres
    try:
        # Migrate Executives
        print("\n[*] Migrating 'executives' table...")
        execs = sqlite_session.query(ExecutiveDB).all()
        print(f"    Found {len(execs)} executive record(s) in SQLite.")
        for ex in execs:
            # Check if exists in target
            exists = postgres_session.query(ExecutiveDB).filter_by(id=ex.id).first()
            if not exists:
                new_ex = ExecutiveDB(
                    id=ex.id,
                    name=ex.name,
                    role=ex.role,
                    avatar=ex.avatar,
                    email=ex.email,
                    owner_id=ex.owner_id
                )
                postgres_session.add(new_ex)
        postgres_session.commit()
        print("[+] Executives migration complete.")

        # Migrate Users
        print("\n[*] Migrating 'users' table...")
        users = sqlite_session.query(UserDB).all()
        print(f"    Found {len(users)} user record(s) in SQLite.")
        for usr in users:
            exists = postgres_session.query(UserDB).filter_by(id=usr.id).first()
            if not exists:
                new_usr = UserDB(
                    id=usr.id,
                    email=usr.email,
                    hashed_password=usr.hashed_password,
                    name=usr.name,
                    role=usr.role
                )
                postgres_session.add(new_usr)
        postgres_session.commit()
        print("[+] Users migration complete.")

        # Migrate User Workspaces
        print("\n[*] Migrating 'user_workspaces' table...")
        mappings = sqlite_session.query(UserWorkspaceDB).all()
        print(f"    Found {len(mappings)} user workspace mapping record(s) in SQLite.")
        for mp in mappings:
            exists = postgres_session.query(UserWorkspaceDB).filter_by(id=mp.id).first()
            if not exists:
                new_mp = UserWorkspaceDB(
                    id=mp.id,
                    user_id=mp.user_id,
                    executive_id=mp.executive_id
                )
                postgres_session.add(new_mp)
        postgres_session.commit()
        print("[+] User Workspaces migration complete.")

        # Migrate OAuth Tokens
        print("\n[*] Migrating 'oauth_tokens' table...")
        tokens = sqlite_session.query(OAuthTokenDB).all()
        print(f"    Found {len(tokens)} token record(s) in SQLite.")
        for tk in tokens:
            exists = postgres_session.query(OAuthTokenDB).filter_by(id=tk.id).first()
            if not exists:
                new_tk = OAuthTokenDB(
                    id=tk.id,
                    executive_id=tk.executive_id,
                    provider=tk.provider,
                    access_token=tk.access_token,
                    refresh_token=tk.refresh_token,
                    expires_at=tk.expires_at
                )
                postgres_session.add(new_tk)
        postgres_session.commit()
        print("[+] OAuth Tokens migration complete.")

        # Migrate Action Items
        print("\n[*] Migrating 'action_items' table...")
        actions = sqlite_session.query(ActionItemDB).all()
        print(f"    Found {len(actions)} action item record(s) in SQLite.")
        for ac in actions:
            exists = postgres_session.query(ActionItemDB).filter_by(id=ac.id).first()
            if not exists:
                new_ac = ActionItemDB(
                    id=ac.id,
                    type=ac.type,
                    title=ac.title,
                    description=ac.description,
                    time_proposed=ac.time_proposed,
                    recipient=ac.recipient,
                    status=ac.status,
                    executive_id=ac.executive_id,
                    created_at=ac.created_at
                )
                postgres_session.add(new_ac)
        postgres_session.commit()
        print("[+] Action Items migration complete.")

        print("\n[SUCCESS] Database migration completed successfully!")

    except Exception as e:
        postgres_session.rollback()
        print(f"\n[Error] Migration failed: {e}")
    finally:
        sqlite_session.close()
        postgres_session.close()

if __name__ == "__main__":
    migrate()
