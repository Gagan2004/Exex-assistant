"use client";

import React, { useState, useEffect } from "react";
import {
  Users,
  Calendar,
  Mail,
  CheckCircle2,
  XCircle,
  Mic,
  MicOff,
  Clock,
  Plus,
  Check,
  X,
  UserCheck,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  LogOut
} from "lucide-react";

interface Executive {
  id: string;
  name: string;
  role: string;
  avatar: string;
  email: string;
  owner_id?: string;
  permission?: string;
}

interface ActionItem {
  id: string;
  type: string;
  title: string;
  description: string;
  time_proposed?: string;
  recipient?: string;
  status: string;
  executive_id: string;
}

interface Meeting {
  id: string;
  title: string;
  description: string;
  start_time: string;
  end_time: string;
  meet_link?: string;
  attendees?: string[];
  status: string;
}

export default function Dashboard() {
  const [executives, setExecutives] = useState<Executive[]>([]);
  const [selectedExec, setSelectedExec] = useState<Executive | null>(null);
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(false);
  const [directiveText, setDirectiveText] = useState("");
  const [wasVoiceCaptured, setWasVoiceCaptured] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalData, setModalData] = useState<any>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [modalTimeInput, setModalTimeInput] = useState("");
  const [modalTitleInput, setModalTitleInput] = useState("");
  const [modalRecipientInput, setModalRecipientInput] = useState("");
  const [googleConnected, setGoogleConnected] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);

  // Authentication State
  const [token, setToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [isSignUp, setIsSignUp] = useState(true);
  const [loginName, setLoginName] = useState("");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Workspace Creation State
  const [isCreateWorkspaceModalOpen, setIsCreateWorkspaceModalOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState("");
  const [newWorkspaceRole, setNewWorkspaceRole] = useState("");
  const [newWorkspaceEmail, setNewWorkspaceEmail] = useState("");
  const [newWorkspaceAvatar, setNewWorkspaceAvatar] = useState("");
  const [createWorkspaceError, setCreateWorkspaceError] = useState("");
  const [createWorkspaceLoading, setCreateWorkspaceLoading] = useState(false);

  // Admin Panel State
  const [adminTab, setAdminTab] = useState<"users" | "workspaces" | "logs">("users");
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminWorkspaces, setAdminWorkspaces] = useState<any[]>([]);
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  
  // Admin Modals and Form States
  const [isAdminUserModalOpen, setIsAdminUserModalOpen] = useState(false);
  const [selectedAdminUser, setSelectedAdminUser] = useState<any | null>(null); // null means adding a new user
  const [adminUserNameInput, setAdminUserNameInput] = useState("");
  const [adminUserEmailInput, setAdminUserEmailInput] = useState("");
  const [adminUserRoleInput, setAdminUserRoleInput] = useState("executive");
  const [adminUserPasswordInput, setAdminUserPasswordInput] = useState("");
  const [adminUserError, setAdminUserError] = useState("");
  const [adminUserLoading, setAdminUserLoading] = useState(false);

  const [isAdminWorkspaceModalOpen, setIsAdminWorkspaceModalOpen] = useState(false);
  const [selectedAdminWorkspace, setSelectedAdminWorkspace] = useState<any | null>(null); // null means adding a new workspace
  const [adminWorkspaceNameInput, setAdminWorkspaceNameInput] = useState("");
  const [adminWorkspaceRoleInput, setAdminWorkspaceRoleInput] = useState("");
  const [adminWorkspaceEmailInput, setAdminWorkspaceEmailInput] = useState("");
  const [adminWorkspaceAvatarInput, setAdminWorkspaceAvatarInput] = useState("");
  const [adminWorkspaceOwnerInput, setAdminWorkspaceOwnerInput] = useState(""); // user ID
  const [adminWorkspaceError, setAdminWorkspaceError] = useState("");
  const [adminWorkspaceLoading, setAdminWorkspaceLoading] = useState(false);

  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [mappingWorkspace, setMappingWorkspace] = useState<any | null>(null);
  const [mappingSelectedUserIds, setMappingSelectedUserIds] = useState<string[]>([]);
  const [mappingLoading, setMappingLoading] = useState(false);

  // Workspace Members Management State (Organization Tenancy)
  const [isWorkspaceMembersModalOpen, setIsWorkspaceMembersModalOpen] = useState(false);
  const [workspaceMembersList, setWorkspaceMembersList] = useState<any[]>([]);
  const [workspaceMembersLoading, setWorkspaceMembersLoading] = useState(false);
  const [workspaceMembersSaveLoading, setWorkspaceMembersSaveLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePermission, setInvitePermission] = useState("read");
  const [inviteLoading, setInviteLoading] = useState(false);

  const isReadOnly = selectedExec?.permission === "read" && selectedExec?.owner_id !== currentUser?.id;

  // Initialize SpeechRecognition on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const rec = new SpeechRecognition();
        rec.continuous = false;
        rec.interimResults = false;
        rec.lang = "en-US";
        
        rec.onstart = () => {
          setIsRecording(true);
        };
        
        rec.onresult = (event: any) => {
          const transcript = event.results[0][0].transcript;
          if (transcript) {
            setDirectiveText(transcript);
            setWasVoiceCaptured(true);
          }
        };
        
        rec.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
          if (event.error !== "no-speech") {
            showToast(`Voice capture error: ${event.error}`, "error");
          }
          setIsRecording(false);
        };
        
        rec.onend = () => {
          setIsRecording(false);
        };
        
        setRecognition(rec);
      }
    }
  }, []);

  const rawBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || (typeof window !== "undefined"
    ? (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
      ? "http://127.0.0.1:8001"
      : "/_/backend")
    : "http://127.0.0.1:8001");
  const backendUrl = rawBackendUrl.endsWith("/") ? rawBackendUrl.slice(0, -1) : rawBackendUrl;

  // Restore session from localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("token");
      if (storedToken) {
        setToken(storedToken);
        fetchMe(storedToken);
      }
    }
  }, []);

  // Fetch initial data once token is set
  useEffect(() => {
    if (token) {
      fetchExecutives();
    } else {
      setExecutives([]);
      setSelectedExec(null);
    }
  }, [token]);

  useEffect(() => {
    if (selectedExec && token) {
      fetchDashboard(selectedExec.id);
      fetchAuthStatus(selectedExec.id);
      fetchMeetings(selectedExec.id);
    }
  }, [selectedExec, token]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const authenticatedFetch = async (url: string, options: RequestInit = {}) => {
    const activeToken = token || (typeof window !== "undefined" ? localStorage.getItem("token") : null);
    const headers = {
      ...options.headers,
      ...(activeToken ? { "Authorization": `Bearer ${activeToken}` } : {})
    };
    try {
      const res = await fetch(url, { ...options, headers });
      if (res.status === 401) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
        }
        setCurrentUser(null);
        setToken(null);
        showToast("Session expired. Please log in again.", "error");
        throw new Error("Unauthorized");
      }
      if (res.status === 403) {
        showToast("Access denied: You do not have permission to manage this workspace.", "error");
        throw new Error("Forbidden");
      }
      return res;
    } catch (err) {
      console.error("Fetch request error:", err);
      throw err;
    }
  };

  // Fetch admin panel data
  useEffect(() => {
    if (token && currentUser?.role === "admin") {
      if (adminTab === "users") {
        fetchAdminUsers();
      } else if (adminTab === "workspaces") {
        fetchAdminWorkspaces();
        fetchAdminUsers(); // owner lists
      } else if (adminTab === "logs") {
        fetchActivityLogs();
      }
    }
  }, [currentUser, adminTab, token]);

  const fetchAdminUsers = async () => {
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/admin/users`);
      if (res.ok) {
        const data = await res.json();
        setAdminUsers(data);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch users", "error");
    }
  };

  const fetchAdminWorkspaces = async () => {
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/admin/workspaces`);
      if (res.ok) {
        const data = await res.json();
        setAdminWorkspaces(data);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch workspaces", "error");
    }
  };

  const fetchActivityLogs = async () => {
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/admin/logs`);
      if (res.ok) {
        const data = await res.json();
        setActivityLogs(data);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch logs", "error");
    }
  };

  const fetchWorkspaceMembers = async (workspaceId: string) => {
    setWorkspaceMembersLoading(true);
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/workspaces/${workspaceId}/members`);
      if (res.ok) {
        const data = await res.json();
        setWorkspaceMembersList(data);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch workspace members", "error");
    } finally {
      setWorkspaceMembersLoading(false);
    }
  };

  const handleWorkspaceMembersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExec) return;
    setWorkspaceMembersSaveLoading(true);
    try {
      const payload = {
        members: workspaceMembersList.map((m) => ({
          user_id: m.user_id || null,
          email: m.email,
          has_access: m.has_access,
          permission: m.permission,
          is_pending: !!m.is_pending,
        })),
      };
      const res = await authenticatedFetch(`${backendUrl}/api/workspaces/${selectedExec.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        showToast("Workspace members updated successfully!");
        setIsWorkspaceMembersModalOpen(false);
      } else {
        showToast("Failed to update workspace members.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Connection error.", "error");
    } finally {
      setWorkspaceMembersSaveLoading(false);
    }
  };

  const toggleWorkspaceMemberAccess = (userId: string | null, email: string) => {
    setWorkspaceMembersList((prev) =>
      prev.map((m) => {
        const matches = userId ? m.user_id === userId : m.email === email;
        return matches ? { ...m, has_access: !m.has_access } : m;
      })
    );
  };

  const changeWorkspaceMemberPermission = (userId: string | null, email: string, permission: string) => {
    setWorkspaceMembersList((prev) =>
      prev.map((m) => {
        const matches = userId ? m.user_id === userId : m.email === email;
        return matches ? { ...m, permission } : m;
      })
    );
  };

  const handleWorkspaceInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !selectedExec) return;
    setInviteLoading(true);
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/workspaces/${selectedExec.id}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), permission: invitePermission }),
      });
      if (res.ok) {
        showToast("Invitation sent successfully!");
        setInviteEmail("");
        // Reload list to show the new invitation
        await fetchWorkspaceMembers(selectedExec.id);
      } else {
        const errData = await res.json();
        showToast(errData.detail || "Failed to invite user.", "error");
      }
    } catch (err) {
      console.error(err);
      showToast("Connection error.", "error");
    } finally {
      setInviteLoading(false);
    }
  };

  const handleAdminUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminUserError("");
    setAdminUserLoading(true);
    try {
      const isEdit = !!selectedAdminUser;
      const url = isEdit 
        ? `${backendUrl}/api/admin/users/${selectedAdminUser.id}` 
        : `${backendUrl}/api/admin/users`;
      const method = isEdit ? "PUT" : "POST";
      const payload = {
        name: adminUserNameInput,
        email: adminUserEmailInput,
        role: adminUserRoleInput,
        ...(adminUserPasswordInput ? { password: adminUserPasswordInput } : {})
      };

      const res = await authenticatedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(isEdit ? "User updated successfully!" : "User created successfully!");
        setIsAdminUserModalOpen(false);
        fetchAdminUsers();
      } else {
        const errData = await res.json();
        setAdminUserError(errData.detail || "Failed to save user.");
      }
    } catch (err) {
      setAdminUserError("Connection error.");
    } finally {
      setAdminUserLoading(false);
    }
  };

  const handleAdminUserDelete = async (userId: string, userName: string) => {
    if (userId === currentUser?.id) {
      showToast("You cannot delete your own account.", "error");
      return;
    }
    if (!window.confirm(`Are you sure you want to delete user '${userName}'? This will cascadingly delete all their owned workspaces and access mappings.`)) {
      return;
    }
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/admin/users/${userId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        showToast("User deleted successfully!");
        fetchAdminUsers();
      }
    } catch (err) {
      showToast("Failed to delete user", "error");
    }
  };

  const handleAdminWorkspaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminWorkspaceError("");
    setAdminWorkspaceLoading(true);
    try {
      const isEdit = !!selectedAdminWorkspace;
      const url = isEdit 
        ? `${backendUrl}/api/admin/workspaces/${selectedAdminWorkspace.id}` 
        : `${backendUrl}/api/admin/workspaces`;
      const method = isEdit ? "PUT" : "POST";
      const payload = {
        name: adminWorkspaceNameInput,
        role: adminWorkspaceRoleInput,
        email: adminWorkspaceEmailInput,
        avatar: adminWorkspaceAvatarInput || null,
        owner_id: adminWorkspaceOwnerInput || null
      };

      const res = await authenticatedFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast(isEdit ? "Workspace updated successfully!" : "Workspace created successfully!");
        setIsAdminWorkspaceModalOpen(false);
        fetchAdminWorkspaces();
      } else {
        const errData = await res.json();
        setAdminWorkspaceError(errData.detail || "Failed to save workspace.");
      }
    } catch (err) {
      setAdminWorkspaceError("Connection error.");
    } finally {
      setAdminWorkspaceLoading(false);
    }
  };

  const handleAdminWorkspaceDelete = async (workspaceId: string, workspaceName: string) => {
    if (!window.confirm(`Are you absolutely sure you want to delete workspace '${workspaceName}'? This will permanently wipe all its action items, meetings, and integration credentials.`)) {
      return;
    }
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/admin/workspaces/${workspaceId}`, {
        method: "DELETE"
      });
      if (res.ok) {
        showToast("Workspace deleted successfully!");
        fetchAdminWorkspaces();
      }
    } catch (err) {
      showToast("Failed to delete workspace", "error");
    }
  };

  const openMappingModal = async (workspace: any) => {
    setMappingWorkspace(workspace);
    setMappingLoading(true);
    setIsMappingModalOpen(true);
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/admin/workspaces/${workspace.id}/users`);
      if (res.ok) {
        const userIds = await res.json();
        setMappingSelectedUserIds(userIds);
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to load workspace access list", "error");
    } finally {
      setMappingLoading(false);
    }
  };

  const handleMappingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mappingWorkspace) return;
    setMappingLoading(true);
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/admin/workspaces/${mappingWorkspace.id}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: mappingSelectedUserIds })
      });
      if (res.ok) {
        showToast("Workspace access updated successfully!");
        setIsMappingModalOpen(false);
        fetchAdminWorkspaces();
      }
    } catch (err) {
      showToast("Failed to save workspace access", "error");
    } finally {
      setMappingLoading(false);
    }
  };

  const fetchMe = async (authToken: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/auth/me`, {
        headers: {
          "Authorization": `Bearer ${authToken}`
        }
      });
      if (res.ok) {
        const user = await res.json();
        setCurrentUser(user);
      } else {
        if (typeof window !== "undefined") {
          localStorage.removeItem("token");
        }
        setToken(null);
        setCurrentUser(null);
      }
    } catch (err) {
      console.error("Failed to fetch user session", err);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);
    try {
      const endpoint = isSignUp ? "register" : "login";
      const payload = isSignUp 
        ? { email: loginEmail, password: loginPassword, name: loginName }
        : { email: loginEmail, password: loginPassword };

      const res = await fetch(`${backendUrl}/api/auth/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        if (typeof window !== "undefined") {
          localStorage.setItem("token", data.token);
        }
        setToken(data.token);
        setCurrentUser(data.user);
        showToast(isSignUp ? "Account created successfully!" : "Signed in successfully!");
      } else {
        const errData = await res.json();
        setLoginError(errData.detail || "Authentication failed. Please check your credentials.");
      }
    } catch (err) {
      console.error(err);
      setLoginError("Failed to connect to backend service.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleSignOut = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
    }
    setToken(null);
    setCurrentUser(null);
    setExecutives([]);
    setSelectedExec(null);
    setActions([]);
    setMeetings([]);
    setLoginName("");
    setLoginEmail("");
    setLoginPassword("");
    setIsSignUp(false);
    showToast("Logged out successfully");
  };

  const handleCreateWorkspaceSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateWorkspaceError("");
    setCreateWorkspaceLoading(true);
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/workspaces`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: newWorkspaceName,
          role: newWorkspaceRole,
          email: newWorkspaceEmail,
          avatar: newWorkspaceAvatar || null
        })
      });
      if (res.ok) {
        const newWorkspace = await res.json();
        showToast("Workspace created successfully!");
        setIsCreateWorkspaceModalOpen(false);
        setNewWorkspaceName("");
        setNewWorkspaceRole("");
        setNewWorkspaceEmail("");
        setNewWorkspaceAvatar("");
        // Refresh workspaces
        fetchExecutives();
        setSelectedExec(newWorkspace);
      } else {
        const errData = await res.json();
        setCreateWorkspaceError(errData.detail || "Failed to create workspace.");
      }
    } catch (err) {
      console.error(err);
      setCreateWorkspaceError("Connection error.");
    } finally {
      setCreateWorkspaceLoading(false);
    }
  };

  const handleDeleteWorkspace = async () => {
    if (!selectedExec) return;
    if (!window.confirm(`Are you absolutely sure you want to delete the workspace for ${selectedExec.name}? This will permanently delete all actions, integrations, and meetings. This action cannot be undone.`)) {
      return;
    }
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/workspaces/${selectedExec.id}`, {
        method: "DELETE"
      });
      if (res.ok) {
        showToast("Workspace deleted successfully!");
        const updatedRes = await authenticatedFetch(`${backendUrl}/api/executives`);
        if (updatedRes.ok) {
          const data = await updatedRes.json();
          setExecutives(data);
          if (data.length > 0) {
            setSelectedExec(data[0]);
          } else {
            setSelectedExec(null);
            setActions([]);
            setMeetings([]);
          }
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to delete workspace.", "error");
    }
  };

  const fetchAuthStatus = async (execId: string) => {
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/auth/status?executive_id=${execId}`);
      if (res.ok) {
        const data = await res.json();
        setGoogleConnected(data.google_connected);
      }
    } catch (err) {
      console.error("Failed to fetch auth status", err);
    }
  };

  const syncCalendar = async (provider: "google" | "microsoft") => {
    if (!selectedExec) return;
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/auth/${provider}/url?executive_id=${selectedExec.id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.location.href = data.url;
        }
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to fetch auth URL", "error");
    }
  };

  const disconnectCalendar = async (provider: "google" | "microsoft") => {
    if (!selectedExec) return;
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/auth/disconnect?executive_id=${selectedExec.id}&provider=${provider}`, {
        method: "POST"
      });
      if (res.ok) {
        showToast(`${provider.charAt(0).toUpperCase() + provider.slice(1)} account disconnected successfully!`);
        setGoogleConnected(false);
        fetchMeetings(selectedExec.id);
      } else {
        throw new Error();
      }
    } catch (err) {
      console.error(err);
      showToast("Failed to disconnect account", "error");
    }
  };


  const fetchExecutives = async () => {
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/executives`);
      if (res.ok) {
        const data = await res.json();
        setExecutives(data);
        if (data.length > 0) {
          setSelectedExec(data[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch executives from backend. Using mock fallback.", err);
      // Tailor mock fallback based on user's authorized accounts to avoid security leaks
      let mockData: Executive[] = [
        { id: "exec_1", name: "Sarah Jenkins", role: "CEO", avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150", email: "sarah.j@company.com" },
        { id: "exec_2", name: "David Kross", role: "CFO", avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150", email: "david.k@company.com" },
        { id: "exec_3", name: "Elena Rostova", role: "CTO", avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150", email: "elena.r@company.com" },
      ];
      if (currentUser && currentUser.role === "executive") {
        mockData = mockData.filter(ex => ex.email === currentUser.email || 
          (currentUser.email.startsWith("sarah") && ex.id === "exec_1") || 
          (currentUser.email.startsWith("david") && ex.id === "exec_2") || 
          (currentUser.email.startsWith("elena") && ex.id === "exec_3"));
      }
      setExecutives(mockData);
      if (mockData.length > 0) {
        setSelectedExec(mockData[0]);
      }
    }
  };

  const fetchDashboard = async (execId: string) => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/dashboard?executive_id=${execId}`);
      if (res.ok) {
        const data = await res.json();
        setActions(data);
      }
    } catch (err) {
      console.error("Error fetching actions. Falling back to mock data.", err);
      // Fallback
      const mockActions: ActionItem[] = [
        {
          id: "act_1",
          type: "calendar",
          title: "Schedule Q3 Board Prep",
          description: "30-minute sync with John (Investor) next Tuesday afternoon.",
          time_proposed: "Tuesday, June 9th at 2:00 PM - 2:30 PM",
          recipient: "john.investor@ventures.com",
          status: "pending",
          executive_id: "exec_1"
        },
        {
          id: "act_2",
          type: "email",
          title: "Draft Reply: Budget Adjustment",
          description: "Draft reply to Finance Committee confirming approval of the revised hiring budget.",
          recipient: "finance-committee@company.com",
          status: "pending",
          executive_id: "exec_2"
        },
        {
          id: "act_3",
          type: "task",
          title: "Follow Up on Architecture Review",
          description: "Remind security team to submit the compliance checklist by Friday.",
          status: "pending",
          executive_id: "exec_3"
        }
      ];
      setActions(mockActions.filter(act => act.executive_id === execId));
    } finally {
      setLoading(false);
    }
  };

  const fetchMeetings = async (execId: string) => {
    try {
      const res = await authenticatedFetch(`${backendUrl}/api/meetings?executive_id=${execId}`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data);
      }
    } catch (err) {
      console.error("Failed to fetch upcoming meetings", err);
    }
  };

  const handleAction = async (actionId: string, status: "approve" | "reject") => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await authenticatedFetch(`${backendUrl}/api/action/${status}?action_id=${actionId}`, {
        method: "POST",
        headers: {
          "X-Timezone": tz
        }
      });
      if (res.ok) {
        showToast(`Action item ${status}d successfully!`);
        if (selectedExec) {
          fetchDashboard(selectedExec.id);
          fetchMeetings(selectedExec.id);
        }
      } else {
        throw new Error();
      }
    } catch (err) {
      // Local state fallback update
      showToast(`Action simulated: ${status}d (Local)`);
      setActions(prev => prev.filter(act => act.id !== actionId));
    }
  };

  const handleInputResponse = async (res: Response, clearInput: () => void) => {
    if (res.ok) {
      showToast("Directive processed and action created!");
      clearInput();
      if (selectedExec) {
        fetchDashboard(selectedExec.id);
        fetchMeetings(selectedExec.id);
      }
      return true;
    }

    if (res.status === 422) {
      const errorData = await res.json();
      if (errorData.status === "requires_input") {
        setModalData(errorData.parsed_info);
        setMissingFields(errorData.missing_fields || []);
        setModalTitleInput(errorData.parsed_info.title || "Meeting");
        let initialTime = errorData.parsed_info.time_proposed || "";
        if (initialTime && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(initialTime)) {
          initialTime = initialTime.replace(" ", "T");
        } else if (initialTime && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(initialTime)) {
          initialTime = "";
        }
        setModalTimeInput(initialTime);
        setModalRecipientInput(errorData.parsed_info.recipient || "");
        setIsModalOpen(true);
        clearInput();
        return true;
      }
    }
    return false;
  };

  const submitDirective = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!directiveText.trim() || !selectedExec) return;

    const endpoint = wasVoiceCaptured ? "voice-action" : "text-action";
    const modeLabel = wasVoiceCaptured ? "Voice" : "Text";

    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await authenticatedFetch(`${backendUrl}/api/${endpoint}?executive_id=${selectedExec.id}&text=${encodeURIComponent(directiveText)}`, {
        method: "POST",
        headers: {
          "X-Timezone": tz
        }
      });
      const handled = await handleInputResponse(res, () => {
        setDirectiveText("");
        setWasVoiceCaptured(false);
      });
      if (!handled) throw new Error();
    } catch (err) {
      // Local fallback addition
      const mockNew: ActionItem = {
        id: `act_${Date.now()}`,
        type: directiveText.toLowerCase().includes("meet") || directiveText.toLowerCase().includes("schedule") ? "calendar" : "task",
        title: `New Task from ${modeLabel} Input`,
        description: `${modeLabel} details: "${directiveText}"`,
        status: "pending",
        executive_id: selectedExec.id,
        time_proposed: directiveText.toLowerCase().includes("meet") ? "Proposed: Tomorrow at 2:00 PM (Soft-Lock)" : undefined
      };
      setActions(prev => [mockNew, ...prev]);
      setDirectiveText(" "); // force clear trigger
      setTimeout(() => {
        setDirectiveText("");
        setWasVoiceCaptured(false);
      }, 100);
      showToast(`${modeLabel} directive processed (Simulated)`, "success");
    }
  };


  const submitModalForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExec || !modalData) return;

    try {
      const payload = {
        executive_id: selectedExec.id,
        type: modalData.type,
        title: modalTitleInput,
        description: modalData.description,
        time_proposed: modalTimeInput || null,
        recipient: modalRecipientInput || null
      };

      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const res = await authenticatedFetch(`${backendUrl}/api/action/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Timezone": tz
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        showToast("Action card successfully created!");
        setIsModalOpen(false);
        fetchDashboard(selectedExec.id);
        fetchMeetings(selectedExec.id);
      } else {
        throw new Error("Failed to create action");
      }
    } catch (err) {
      console.error(err);
      // Local fallback
      const mockNew: ActionItem = {
        id: `act_${Date.now()}`,
        type: modalData.type,
        title: modalTitleInput,
        description: `Resolved details: "${modalData.description}"`,
        status: "pending",
        executive_id: selectedExec.id,
        time_proposed: modalTimeInput || undefined,
        recipient: modalRecipientInput || undefined
      };
      setActions(prev => [mockNew, ...prev]);
      setIsModalOpen(false);
      showToast("Action card successfully created (Simulated)", "success");
    }
  };

  const handleMockRecord = () => {
    if (!isRecording) {
      setIsRecording(true);
      const suggestions = [
        "Schedule a calendar invite with Dave for Friday morning to review hiring budgets",
        "Draft email to team confirming the meeting location change for tomorrow",
        "Set calendar hold for board slide preparation next Monday from 2 PM to 5 PM"
      ];
      const randomMemo = suggestions[Math.floor(Math.random() * suggestions.length)];

      // Simulate speaking / processing delays
      setTimeout(() => {
        setDirectiveText(randomMemo);
        setWasVoiceCaptured(true);
        setIsRecording(false);
      }, 2500);
    }
  };

  const handleVoiceRecord = () => {
    if (!recognition) {
      // Fallback if SpeechRecognition is not supported
      showToast("Speech recognition not supported. Using simulation...");
      handleMockRecord();
      return;
    }

    if (isRecording) {
      recognition.stop();
    } else {
      try {
        setDirectiveText("");
        setWasVoiceCaptured(true);
        recognition.start();
      } catch (err) {
        console.error(err);
        setIsRecording(false);
      }
    }
  };

  if (!token || !currentUser) {
    return (
      <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans select-none antialiased relative overflow-hidden justify-center items-center p-4">
        {/* Background gradients */}
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

        {/* Premium login card */}
        <div className="max-w-md w-full bg-neutral-900/40 border border-neutral-800/80 backdrop-blur-2xl rounded-3xl p-8 shadow-2xl relative z-10 flex flex-col gap-6 animate-fadeIn">
          <div className="flex flex-col items-center text-center gap-3">
            <div className="bg-gradient-to-tr from-blue-600 to-violet-600 p-3 rounded-2xl text-white shadow-xl shadow-blue-500/10">
              <Sparkles className="h-8 w-8" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
                Hermes AI Co-Pilot
              </h1>
              <p className="text-xs text-neutral-500 font-medium mt-1">
                Personal Executive Assistant SaaS &mdash; {isSignUp ? "Create an Account" : "Portal Sign In"}
              </p>
            </div>
          </div>

          <form onSubmit={handleLoginSubmit} className="flex flex-col gap-4 mt-2">
            {loginError && (
              <div className="bg-red-950/40 border border-red-900/30 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {isSignUp && (
              <div className="flex flex-col gap-1.5 animate-fadeIn">
                <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Full Name</label>
                <input
                  type="text"
                  required
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full bg-neutral-950 border border-neutral-850 rounded-xl px-4 py-3 text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Email Address</label>
              <input
                type="email"
                required
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="ea@company.com"
                className="w-full bg-neutral-950 border border-neutral-850 rounded-xl px-4 py-3 text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Password</label>
              <input
                type="password"
                required
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-neutral-950 border border-neutral-850 rounded-xl px-4 py-3 text-sm text-neutral-200 placeholder-neutral-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-95 text-white font-semibold text-sm py-3.5 rounded-xl transition shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 cursor-pointer mt-2"
            >
              {loginLoading ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                isSignUp ? "Sign Up" : "Sign In"
              )}
            </button>
          </form>

          <div className="text-center text-xs text-neutral-400 mt-2">
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              type="button"
              onClick={() => {
                setIsSignUp(!isSignUp);
                setLoginError("");
              }}
              className="text-blue-400 hover:text-blue-300 font-semibold underline cursor-pointer bg-transparent border-none p-0 outline-none"
            >
              {isSignUp ? "Sign In" : "Sign Up"}
            </button>
          </div>

          {/* Quick Click Demo Credentials */}
          <div className="flex flex-col gap-3 border-t border-neutral-800/60 pt-5">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider text-center">Quick-Click Demo Accounts</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setLoginEmail("ea@company.com");
                  setLoginPassword("password123");
                }}
                className="bg-neutral-950/60 border border-neutral-850 hover:bg-neutral-800/40 text-neutral-300 hover:text-white p-2.5 rounded-xl transition text-left cursor-pointer font-medium"
              >
                <p className="font-semibold text-neutral-200">Executive Assistant</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">ea@company.com</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginEmail("sarah@company.com");
                  setLoginPassword("password123");
                }}
                className="bg-neutral-950/60 border border-neutral-850 hover:bg-neutral-800/40 text-neutral-300 hover:text-white p-2.5 rounded-xl transition text-left cursor-pointer font-medium"
              >
                <p className="font-semibold text-neutral-200">Sarah Jenkins (CEO)</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">sarah@company.com</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginEmail("david@company.com");
                  setLoginPassword("password123");
                }}
                className="bg-neutral-950/60 border border-neutral-850 hover:bg-neutral-800/40 text-neutral-300 hover:text-white p-2.5 rounded-xl transition text-left cursor-pointer font-medium"
              >
                <p className="font-semibold text-neutral-200">David Kross (CFO)</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">david@company.com</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginEmail("elena@company.com");
                  setLoginPassword("password123");
                }}
                className="bg-neutral-950/60 border border-neutral-850 hover:bg-neutral-800/40 text-neutral-300 hover:text-white p-2.5 rounded-xl transition text-left cursor-pointer font-medium"
              >
                <p className="font-semibold text-neutral-200">Elena Rostova (CTO)</p>
                <p className="text-[10px] text-neutral-500 mt-0.5">elena@company.com</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginEmail("admin@company.com");
                  setLoginPassword("admin123");
                }}
                className="bg-neutral-950/60 border border-neutral-850 hover:bg-neutral-800/40 text-neutral-300 hover:text-white p-2.5 rounded-xl transition text-left cursor-pointer font-medium col-span-2"
              >
                <p className="font-semibold text-neutral-200 text-center">System Administrator (Admin)</p>
                <p className="text-[10px] text-neutral-500 mt-0.5 text-center">admin@company.com</p>
              </button>
            </div>
          </div>
        </div>

        {/* Global Toast Notification */}
        {notification && (
          <div className={`fixed bottom-5 right-5 px-5 py-3.5 rounded-xl shadow-2xl border backdrop-blur-xl transition-all duration-300 z-50 flex items-center gap-2 text-sm font-medium ${
            notification.type === 'success' 
              ? 'bg-neutral-900/90 text-emerald-400 border-emerald-500/20' 
              : 'bg-neutral-900/90 text-red-400 border-red-500/20'
          }`}>
            {notification.type === 'success' ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
            {notification.message}
          </div>
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans select-none antialiased relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-blue-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-violet-600/10 blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-xl sticky top-0 z-50 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-tr from-blue-600 to-violet-600 p-2 rounded-xl text-white shadow-lg shadow-blue-500/20">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-neutral-200 to-neutral-400 bg-clip-text text-transparent">
              Hermes AI Co-Pilot
            </h1>
            <p className="text-xs text-neutral-500 font-medium">Personal Executive Assistant SaaS</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* User Profile Info */}
          {currentUser && (
            <div className="flex items-center gap-3 bg-neutral-900/80 border border-neutral-800 px-4 py-1.5 rounded-full">
              <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-blue-600 to-violet-600 flex items-center justify-center text-xs font-bold text-white uppercase">
                {currentUser.name.charAt(0)}
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-xs font-semibold text-neutral-200 leading-tight">{currentUser.name}</p>
                <p className="text-[10px] text-neutral-500 leading-none capitalize mt-0.5">{currentUser.role === 'ea' ? 'Assistant Portal' : `${currentUser.role} Portal`}</p>
              </div>
            </div>
          )}



          {/* Connection status indicators */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-full text-xs text-neutral-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Backend: {backendUrl}
          </div>

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 bg-neutral-900 hover:bg-neutral-800/80 border border-neutral-800 hover:border-neutral-750 px-3 py-1.5 rounded-full text-xs text-neutral-400 hover:text-white cursor-pointer transition-all"
            title="Sign Out"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Workspace Wrapper */}
      {currentUser?.role === "admin" ? (
        <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-6 animate-fadeIn">
          {/* Admin Sidebar */}
          <aside className="lg:col-span-1 flex flex-col gap-4">
            <div className="bg-neutral-900/60 border border-neutral-800/60 backdrop-blur-lg rounded-2xl p-5 flex flex-col gap-4">
              <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                <Users className="h-4 w-4" /> Admin Console
              </h2>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setAdminTab("users")}
                  className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-300 ${
                    adminTab === "users"
                      ? "bg-neutral-850 border-l-4 border-blue-500 text-white shadow-md shadow-black/40"
                      : "bg-neutral-950/40 border-l-4 border-transparent hover:bg-neutral-800/40 text-neutral-400 hover:text-neutral-200"
                  } border border-neutral-850 font-semibold text-sm cursor-pointer`}
                >
                  <span>Users Control</span>
                </button>

                <button
                  onClick={() => setAdminTab("workspaces")}
                  className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-300 ${
                    adminTab === "workspaces"
                      ? "bg-neutral-850 border-l-4 border-blue-500 text-white shadow-md shadow-black/40"
                      : "bg-neutral-950/40 border-l-4 border-transparent hover:bg-neutral-800/40 text-neutral-400 hover:text-neutral-200"
                  } border border-neutral-850 font-semibold text-sm cursor-pointer`}
                >
                  <span>Workspaces Control</span>
                </button>

                <button
                  onClick={() => setAdminTab("logs")}
                  className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-300 ${
                    adminTab === "logs"
                      ? "bg-neutral-850 border-l-4 border-blue-500 text-white shadow-md shadow-black/40"
                      : "bg-neutral-950/40 border-l-4 border-transparent hover:bg-neutral-800/40 text-neutral-400 hover:text-neutral-200"
                  } border border-neutral-850 font-semibold text-sm cursor-pointer`}
                >
                  <span>Activity Logs Feed</span>
                </button>
              </div>
            </div>
          </aside>

          {/* Admin Main View */}
          <section className="lg:col-span-3 flex flex-col gap-6">
            
            {/* Users Tab */}
            {adminTab === "users" && (
              <div className="bg-neutral-900/60 border border-neutral-800/60 backdrop-blur-lg rounded-2xl p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Users Directory</h3>
                    <p className="text-xs text-neutral-500 mt-1">Manage user profiles, authorization roles, and workspace scope mappings.</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedAdminUser(null);
                      setAdminUserNameInput("");
                      setAdminUserEmailInput("");
                      setAdminUserRoleInput("executive");
                      setAdminUserPasswordInput("");
                      setAdminUserError("");
                      setIsAdminUserModalOpen(true);
                    }}
                    className="bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition hover:opacity-95 shadow-md cursor-pointer"
                  >
                    <Plus className="h-4 w-4" /> Add User
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-800 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Name</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Workspaces</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-850 text-sm">
                      {adminUsers.map((usr) => (
                        <tr key={usr.id} className="hover:bg-neutral-900/20 transition-colors">
                          <td className="py-3.5 px-4 font-semibold text-white">{usr.name}</td>
                          <td className="py-3.5 px-4 text-neutral-405">{usr.email}</td>
                          <td className="py-3.5 px-4">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold capitalize ${
                              usr.role === 'admin'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : usr.role === 'ea'
                                  ? 'bg-violet-500/10 text-violet-400 border border-violet-500/20'
                                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}>
                              {usr.role}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-xs">
                            <span className="bg-neutral-800 text-neutral-300 font-bold px-2.5 py-0.5 rounded-full">
                              {usr.allowed_executives?.length || 0} allowed
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedAdminUser(usr);
                                setAdminUserNameInput(usr.name);
                                setAdminUserEmailInput(usr.email);
                                setAdminUserRoleInput(usr.role);
                                setAdminUserPasswordInput("");
                                setAdminUserError("");
                                setIsAdminUserModalOpen(true);
                              }}
                              className="text-xs bg-neutral-800 hover:bg-neutral-750 text-neutral-300 px-2.5 py-1.5 rounded-lg border border-neutral-700 transition cursor-pointer font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleAdminUserDelete(usr.id, usr.name)}
                              disabled={usr.id === currentUser?.id}
                              className="text-xs bg-red-950/40 hover:bg-red-900/40 text-red-400 px-2.5 py-1.5 rounded-lg border border-red-900/35 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Workspaces Tab */}
            {adminTab === "workspaces" && (
              <div className="bg-neutral-900/60 border border-neutral-800/60 backdrop-blur-lg rounded-2xl p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">Workspaces Control Room</h3>
                    <p className="text-xs text-neutral-500 mt-1">Manipulate all tenant workspaces, re-assign owner credentials, and regulate direct assistant mappings.</p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedAdminWorkspace(null);
                      setAdminWorkspaceNameInput("");
                      setAdminWorkspaceRoleInput("");
                      setAdminWorkspaceEmailInput("");
                      setAdminWorkspaceAvatarInput("");
                      setAdminWorkspaceOwnerInput("");
                      setAdminWorkspaceError("");
                      setIsAdminWorkspaceModalOpen(true);
                    }}
                    className="bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 transition hover:opacity-95 shadow-md cursor-pointer"
                  >
                    <Plus className="h-4 w-4" /> Create Workspace
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-neutral-800 text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                        <th className="py-3 px-4">Workspace</th>
                        <th className="py-3 px-4">Owner</th>
                        <th className="py-3 px-4">Workspace Email</th>
                        <th className="py-3 px-4">Assistants</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-850 text-sm">
                      {adminWorkspaces.map((work) => (
                        <tr key={work.id} className="hover:bg-neutral-900/20 transition-colors">
                          <td className="py-3.5 px-4 flex items-center gap-3">
                            <img src={work.avatar} className="h-9 w-9 rounded-full object-cover border border-neutral-700" alt={work.name} />
                            <div>
                              <p className="font-semibold text-white leading-tight">{work.name}</p>
                              <p className="text-[10px] text-neutral-500 mt-0.5">{work.role}</p>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-neutral-350">
                            {work.owner_name ? (
                              <span className="font-medium">{work.owner_name}</span>
                            ) : (
                              <span className="text-neutral-600 italic">Unassigned (Demo)</span>
                            )}
                          </td>
                          <td className="py-3.5 px-4 text-neutral-400">{work.email}</td>
                          <td className="py-3.5 px-4">
                            <button
                              onClick={() => openMappingModal(work)}
                              className="text-xs bg-neutral-850 hover:bg-neutral-800 border border-neutral-750 px-2.5 py-1 rounded-full font-bold text-neutral-305 transition cursor-pointer"
                            >
                              {work.mapped_users_count} mapped
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-right flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                setSelectedAdminWorkspace(work);
                                setAdminWorkspaceNameInput(work.name);
                                setAdminWorkspaceRoleInput(work.role);
                                setAdminWorkspaceEmailInput(work.email);
                                setAdminWorkspaceAvatarInput(work.avatar || "");
                                setAdminWorkspaceOwnerInput(work.owner_id || "");
                                setAdminWorkspaceError("");
                                setIsAdminWorkspaceModalOpen(true);
                              }}
                              className="text-xs bg-neutral-800 hover:bg-neutral-750 text-neutral-300 px-2.5 py-1.5 rounded-lg border border-neutral-700 transition cursor-pointer font-medium"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleAdminWorkspaceDelete(work.id, work.name)}
                              className="text-xs bg-red-950/40 hover:bg-red-900/40 text-red-400 px-2.5 py-1.5 rounded-lg border border-red-900/35 transition cursor-pointer font-medium"
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Logs Tab */}
            {adminTab === "logs" && (
              <div className="bg-neutral-900/60 border border-neutral-800/60 backdrop-blur-lg rounded-2xl p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between border-b border-neutral-800/80 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-white">System Activity Logs Feed</h3>
                    <p className="text-xs text-neutral-500 mt-1">Live audit trail recording actions, resource adjustments, and user authentications.</p>
                  </div>
                  <button
                    onClick={fetchActivityLogs}
                    className="bg-neutral-850 hover:bg-neutral-800 text-neutral-300 font-semibold text-xs px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition border border-neutral-750 cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Refresh Logs
                  </button>
                </div>

                <div className="flex flex-col gap-3.5 max-h-[500px] overflow-y-auto pr-2">
                  {activityLogs.map((log) => {
                    const formattedTime = new Date(log.created_at).toLocaleString();
                    return (
                      <div key={log.id} className="bg-neutral-950/50 border border-neutral-850 rounded-xl p-4 flex flex-col gap-1.5 hover:border-neutral-750 transition duration-300">
                        <div className="flex items-center justify-between gap-4">
                          <span className={`text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${
                            log.action_type.includes("create")
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : log.action_type.includes("delete")
                                ? "bg-red-500/10 text-red-450 border border-red-500/20"
                                : log.action_type.includes("login")
                                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                            {log.action_type}
                          </span>
                          <span className="text-[10px] text-neutral-500">{formattedTime}</span>
                        </div>
                        <p className="text-sm text-neutral-200 leading-relaxed">{log.description}</p>
                        <p className="text-[10px] text-neutral-500 font-medium">Triggered by: {log.user_name} ({log.user_email || "System"})</p>
                      </div>
                    );
                  })}
                  {activityLogs.length === 0 && (
                    <div className="py-12 text-center text-neutral-500 text-sm">
                      No system activities logged yet.
                    </div>
                  )}
                </div>
              </div>
            )}

          </section>
        </div>
      ) : (
        <div className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Sidebar: Executive List */}
        <aside className="lg:col-span-1 flex flex-col gap-4">
          <div className="bg-neutral-900/60 border border-neutral-800/60 backdrop-blur-lg rounded-2xl p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider flex items-center gap-2">
                <Users className="h-4 w-4" /> Workspaces
              </h2>
              <span className="text-xs bg-neutral-800 text-neutral-300 font-bold px-2 py-0.5 rounded-full">
                Multi-Tenant
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {executives.map((exec) => {
                const isSelected = selectedExec?.id === exec.id;
                return (
                  <button
                    key={exec.id}
                    onClick={() => setSelectedExec(exec)}
                    className={`flex items-center gap-3 w-full p-3 rounded-xl transition-all duration-300 ${isSelected
                      ? "bg-neutral-800 border-l-4 border-blue-500 text-white shadow-md shadow-black/40"
                      : "bg-neutral-950/40 border-l-4 border-transparent hover:bg-neutral-800/40 text-neutral-400 hover:text-neutral-200"
                      } border border-neutral-850`}
                  >
                    <img
                      src={exec.avatar}
                      alt={exec.name}
                      className="h-10 w-10 rounded-full object-cover border border-neutral-700"
                    />
                    <div className="text-left">
                      <p className="font-semibold text-sm leading-tight">{exec.name}</p>
                      <p className="text-xs text-neutral-500 leading-none mt-1">{exec.role} Workspace</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setIsCreateWorkspaceModalOpen(true)}
              className="mt-2 flex items-center justify-center gap-2 w-full p-3 rounded-xl bg-neutral-950/60 hover:bg-neutral-800/40 border border-dashed border-neutral-800 hover:border-neutral-700 text-neutral-400 hover:text-neutral-200 transition-all duration-300 text-xs font-semibold cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Workspace</span>
            </button>
          </div>

          <div className="bg-neutral-900/60 border border-neutral-800/60 backdrop-blur-lg rounded-2xl p-5 flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-neutral-300">System Preferences</h3>
            <div className="space-y-2 text-xs text-neutral-400 leading-relaxed">
              <div className="flex justify-between items-center">
                <span>Google Calendar Sync</span>
                {googleConnected ? (
                  <div className="flex items-center gap-2">
                    <span className="text-emerald-400 font-semibold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Synced
                    </span>
                    <button
                      onClick={() => disconnectCalendar("google")}
                      disabled={isReadOnly}
                      className={`text-[9px] bg-red-950/40 text-red-400 border border-red-900/30 px-2 py-0.5 rounded transition-all ${
                        isReadOnly
                          ? "opacity-45 cursor-not-allowed"
                          : "hover:bg-red-900/60 hover:text-red-300 cursor-pointer"
                      }`}
                      title={isReadOnly ? "Read-Only Workspace" : "Disconnect / Sign Out Google Account"}
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => syncCalendar("google")}
                    disabled={isReadOnly}
                    className={`text-[10px] text-white px-2 py-0.5 rounded font-bold transition-all ${
                      isReadOnly
                        ? "bg-neutral-800 text-neutral-500 cursor-not-allowed"
                        : "bg-blue-600 hover:bg-blue-500 cursor-pointer"
                    }`}
                    title={isReadOnly ? "Read-Only Workspace" : "Sync calendar"}
                  >
                    Sync
                  </button>
                )}
              </div>
              {selectedExec && selectedExec.owner_id === currentUser?.id && (
                <div className="border-t border-neutral-800/60 pt-3 mt-3 flex justify-between items-center">
                  <span>Workspace Access</span>
                  <button
                    onClick={() => {
                      fetchWorkspaceMembers(selectedExec.id);
                      setIsWorkspaceMembersModalOpen(true);
                    }}
                    className="text-[10px] bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 px-2 py-0.5 rounded font-bold cursor-pointer transition-colors"
                  >
                    Members
                  </button>
                </div>
              )}
            </div>
          </div>

        </aside>

        {/* Main Content Area */}
        <section className="lg:col-span-3 flex flex-col gap-6">

          {/* Active Executive Profile Header */}
          {selectedExec && (
            <div className="bg-gradient-to-r from-neutral-900 via-neutral-900 to-neutral-900/40 border border-neutral-800/80 rounded-2xl p-6 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <img
                  src={selectedExec.avatar}
                  alt={selectedExec.name}
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-blue-500/20"
                />
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">{selectedExec.name}</h2>
                  <p className="text-sm text-neutral-400 font-medium">
                    {selectedExec.role} &mdash; <span className="text-neutral-500">{selectedExec.email}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {selectedExec.owner_id === currentUser?.id && (
                  <button
                    onClick={handleDeleteWorkspace}
                    className="bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 p-2.5 rounded-xl border border-red-900/30 transition cursor-pointer"
                    title="Delete Workspace"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                )}

                <button
                  onClick={() => fetchDashboard(selectedExec.id)}
                  className="bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 hover:text-white p-2.5 rounded-xl border border-neutral-700 transition"
                  title="Refresh tasks"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          )}

          {/* Input Interface: Unified Voice and Text Directive Capture */}
          <div className="bg-neutral-900/60 border border-neutral-800/60 backdrop-blur-lg rounded-2xl p-6 flex flex-col gap-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-800/80 pb-4">
              <div>
                <h3 className="text-md font-bold text-white flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-blue-400" /> Executive Directive Capture
                </h3>
                <p className="text-xs text-neutral-500 mt-1">Type an instruction directly or click the microphone to dictate.</p>
              </div>
            </div>

            <form onSubmit={submitDirective} className="flex flex-col gap-3">
              <div className="relative">
                <textarea
                  value={directiveText}
                  onChange={(e) => setDirectiveText(e.target.value)}
                  disabled={isReadOnly}
                  placeholder={isReadOnly ? "You have read-only access to this workspace." : "Type or dictate an instruction... (e.g., 'Schedule meeting with Dave for next Monday at 2 PM')"}
                  className={`w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 pr-14 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all min-h-[90px] resize-none ${isReadOnly ? "opacity-60 cursor-not-allowed" : ""}`}
                />
                <button
                  type="button"
                  onClick={handleVoiceRecord}
                  disabled={isReadOnly}
                  className={`absolute right-3 bottom-3 p-3 rounded-full transition-all duration-300 ${isReadOnly
                      ? "bg-neutral-800 text-neutral-600 cursor-not-allowed opacity-40"
                      : isRecording
                        ? "bg-red-500 animate-pulse text-white shadow-lg shadow-red-500/20 cursor-pointer"
                        : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20 cursor-pointer"
                    }`}
                  title={isReadOnly ? "Read-Only Workspace" : "Voice Record"}
                >
                  {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </button>
              </div>

              {isRecording && (
                <div className="flex items-center gap-2 text-xs text-red-400 font-medium animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                  Recording/Transcribing Executive voice memo...
                </div>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!directiveText.trim() || isReadOnly}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 disabled:from-neutral-800 disabled:to-neutral-850 disabled:text-neutral-600 text-white font-semibold text-sm px-5 py-2.5 rounded-xl flex items-center gap-2 transition hover:opacity-95 shadow-md shadow-blue-900/10 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Plus className="h-4 w-4" /> Process Directive
                </button>
              </div>
            </form>
          </div>


          {/* Pending Approval / HITL Workspace Queue */}
          <div className="bg-neutral-900/60 border border-neutral-800/60 backdrop-blur-lg rounded-2xl p-6 flex flex-col gap-4">
            <h3 className="text-md font-bold text-white flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-violet-400" /> Human-in-the-Loop Action Approval Queue
            </h3>
            <p className="text-xs text-neutral-500 -mt-2">
              Review, adjust, and approve AI-generated operations before scheduling or sending.
            </p>

            {loading ? (
              <div className="py-12 flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 text-neutral-600 animate-spin" />
                <span className="text-sm text-neutral-500">Loading workspace actions...</span>
              </div>
            ) : actions.length === 0 ? (
              <div className="border border-dashed border-neutral-800 rounded-xl p-12 text-center flex flex-col items-center gap-3 bg-neutral-950/20">
                <CheckCircle2 className="h-10 w-10 text-neutral-700" />
                <div>
                  <p className="text-sm font-semibold text-neutral-400">All caught up!</p>
                  <p className="text-xs text-neutral-600 mt-1">No action items awaiting approval for {selectedExec?.name}.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {actions.map((action) => (
                  <div
                    key={action.id}
                    className="border border-neutral-800 bg-neutral-950/60 rounded-xl p-5 flex flex-col justify-between gap-4 transition hover:border-neutral-700 duration-300"
                  >
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full ${action.type === "calendar"
                          ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                          : action.type === "email"
                            ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                            : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}>
                          {action.type} Action
                        </span>

                        <span className="text-xs text-neutral-500 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> Awaiting Review
                        </span>
                      </div>

                      <h4 className="font-bold text-white text-md mt-1">{action.title}</h4>
                      <p className="text-sm text-neutral-400 leading-relaxed">{action.description}</p>

                      {action.time_proposed && (
                        <div className="mt-2 bg-blue-950/40 border border-blue-900/30 rounded-lg p-2.5 text-xs text-blue-300 flex items-center gap-2">
                          <Calendar className="h-4 w-4 shrink-0" />
                          <span>{action.time_proposed}</span>
                        </div>
                      )}

                      {action.recipient && (
                        <div className="bg-violet-950/40 border border-violet-900/30 rounded-lg p-2.5 text-xs text-violet-300 flex items-center gap-2">
                          <Mail className="h-4 w-4 shrink-0" />
                          <span className="truncate">Recipient: {action.recipient}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 border-t border-neutral-800/80 pt-3">
                      <button
                        onClick={() => handleAction(action.id, "reject")}
                        disabled={isReadOnly}
                        className={`flex-1 bg-neutral-900 border border-neutral-800 text-neutral-400 font-semibold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition ${
                          isReadOnly
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:bg-red-950/20 hover:border-red-900/50 hover:text-red-400 cursor-pointer"
                        }`}
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                      <button
                        onClick={() => handleAction(action.id, "approve")}
                        disabled={isReadOnly}
                        className={`flex-1 bg-gradient-to-r from-blue-600 to-violet-600 text-white font-semibold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition ${
                          isReadOnly
                            ? "opacity-50 cursor-not-allowed"
                            : "hover:opacity-95 cursor-pointer"
                        }`}
                      >
                        <Check className="h-3.5 w-3.5" /> Approve & Execute
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Scheduled Meetings Section */}
          <div className="bg-neutral-900/60 border border-neutral-800/60 backdrop-blur-lg rounded-2xl p-6 flex flex-col gap-4">
            <h3 className="text-md font-bold text-white flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-400" /> Upcoming Scheduled Meetings
            </h3>
            <p className="text-xs text-neutral-500 -mt-2">
              All currently scheduled meetings, including calendar summaries, invitees, and video conference links.
            </p>

            {meetings.length === 0 ? (
              <div className="border border-dashed border-neutral-800 rounded-xl p-8 text-center flex flex-col items-center gap-2 bg-neutral-950/20">
                <Calendar className="h-8 w-8 text-neutral-700" />
                <p className="text-xs font-semibold text-neutral-400">No upcoming meetings</p>
                <p className="text-[10px] text-neutral-600">No events found in Google Calendar for {selectedExec?.name}.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {meetings.map((meet) => {
                  // Format readable time range
                  let timeDisplay = meet.start_time;
                  try {
                    const d = new Date(meet.start_time);
                    timeDisplay = d.toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    });
                  } catch (e) { }

                  return (
                    <div
                      key={meet.id}
                      className="border border-neutral-800 bg-neutral-950/60 rounded-xl p-5 flex flex-col justify-between gap-3 transition hover:border-neutral-750 duration-300"
                    >
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="font-bold text-white text-sm truncate" title={meet.title}>
                            {meet.title}
                          </h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold capitalize bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {meet.status}
                          </span>
                        </div>

                        <p className="text-xs text-neutral-400 line-clamp-2" title={meet.description}>
                          {meet.description || "No description / agenda provided."}
                        </p>

                        <div className="bg-neutral-900/40 border border-neutral-800/50 rounded-lg p-2 text-xs text-blue-300 flex items-center gap-2 mt-1">
                          <Clock className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium">{timeDisplay}</span>
                        </div>

                        {meet.attendees && meet.attendees.length > 0 && (
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span className="text-[10px] text-neutral-500">Guests:</span>
                            {meet.attendees.map((email, idx) => (
                              <span
                                key={idx}
                                className="text-[9px] bg-neutral-800 text-neutral-300 px-2 py-0.5 rounded-md truncate max-w-[120px]"
                                title={email}
                              >
                                {email.split("@")[0]}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {meet.meet_link && (
                        <div className="border-t border-neutral-800/60 pt-3 mt-1 flex justify-end">
                          <a
                            href={meet.meet_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 border border-blue-500/20 hover:border-blue-500/40 font-semibold py-1.5 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                          >
                            <Sparkles className="h-3 w-3 animate-pulse text-blue-400" /> Join Google Meet
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </section>
      </div>
      )}

      {/* Interactive Prompt Modal for Missing Calendar Event Details */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative flex flex-col gap-4 mx-4">

            {/* Header */}
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-bold text-lg mb-1">
                <Sparkles className="h-5 w-5" />
                <span>Hermes Needs Details</span>
              </div>
              <p className="text-xs text-neutral-400">
                To schedule this meeting, please provide the required parameters below. Hallucinations are disabled.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={submitModalForm} className="flex flex-col gap-4">

              {/* Event Title Field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  Event Name / Title
                  {missingFields.includes("title") && (
                    <span className="text-[10px] text-red-400 font-medium">(Required)</span>
                  )}
                </label>
                <input
                  type="text"
                  value={modalTitleInput}
                  onChange={(e) => setModalTitleInput(e.target.value)}
                  placeholder="e.g., Sync with Joseph"
                  className={`w-full bg-neutral-950 border ${missingFields.includes("title") && !modalTitleInput.trim()
                      ? "border-red-500/50 focus:ring-red-500"
                      : "border-neutral-800 focus:ring-blue-500"
                    } rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 transition-all`}
                  required
                />
              </div>

              {/* Date & Time Field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                  Proposed Date & Time
                  {missingFields.includes("time_proposed") && (
                    <span className="text-[10px] text-red-400 font-medium">(Required)</span>
                  )}
                </label>
                <input
                  type="datetime-local"
                  value={modalTimeInput}
                  onChange={(e) => setModalTimeInput(e.target.value)}
                  className={`w-full bg-neutral-950 border ${missingFields.includes("time_proposed") && !modalTimeInput.trim()
                      ? "border-red-500/50 focus:ring-red-500"
                      : "border-neutral-800 focus:ring-blue-500"
                    } rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 transition-all`}
                  required
                />
              </div>

              {/* Guest Recipient Email Field (Optional) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">
                  Guest Email (Optional)
                </label>
                <input
                  type="email"
                  value={modalRecipientInput}
                  onChange={(e) => setModalRecipientInput(e.target.value)}
                  placeholder="e.g., joseph@company.com"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2.5 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-200 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!modalTitleInput.trim() || !modalTimeInput.trim()}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-95 text-white font-semibold px-4 py-2 rounded-xl text-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  Create Action Card
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Create Workspace Modal */}
      {isCreateWorkspaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative flex flex-col gap-4 mx-4">
            
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-bold text-lg mb-1">
                <Sparkles className="h-5 w-5" />
                <span>Create Executive Workspace</span>
              </div>
              <p className="text-xs text-neutral-400">
                Set up a private workspace. Only you will have access to it.
              </p>
            </div>

            {createWorkspaceError && (
              <div className="bg-red-950/40 border border-red-900/30 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{createWorkspaceError}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleCreateWorkspaceSubmit} className="flex flex-col gap-4">
              
              {/* Executive Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Executive Name</label>
                <input
                  type="text"
                  required
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="e.g., Sarah Jenkins"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Executive Role */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Role / Position</label>
                <input
                  type="text"
                  required
                  value={newWorkspaceRole}
                  onChange={(e) => setNewWorkspaceRole(e.target.value)}
                  placeholder="e.g., CEO"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Executive Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Executive Email Address</label>
                <input
                  type="email"
                  required
                  value={newWorkspaceEmail}
                  onChange={(e) => setNewWorkspaceEmail(e.target.value)}
                  placeholder="e.g., sarah.j@company.com"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Avatar URL (Optional) */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Avatar Image URL (Optional)</label>
                <input
                  type="url"
                  value={newWorkspaceAvatar}
                  onChange={(e) => setNewWorkspaceAvatar(e.target.value)}
                  placeholder="e.g., https://unsplash.com/..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2.5 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsCreateWorkspaceModalOpen(false);
                    setCreateWorkspaceError("");
                  }}
                  className="bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-200 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createWorkspaceLoading || !newWorkspaceName.trim() || !newWorkspaceRole.trim() || !newWorkspaceEmail.trim()}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-95 text-white font-semibold px-4 py-2 rounded-xl text-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {createWorkspaceLoading ? "Creating..." : "Create Workspace"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Manage Workspace Members Modal */}
      {isWorkspaceMembersModalOpen && selectedExec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl relative flex flex-col gap-4 mx-4">
            
            {/* Header */}
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-bold text-lg mb-1">
                <Users className="h-5 w-5" />
                <span>Manage Workspace Members</span>
              </div>
              <p className="text-xs text-neutral-400">
                Grant workspace access and configure permissions for members of your organization domain.
              </p>
            </div>

            {/* Invite Form */}
            <form onSubmit={handleWorkspaceInvite} className="bg-neutral-950/60 border border-neutral-850 p-3.5 rounded-xl flex flex-col gap-2">
              <span className="text-xs font-semibold text-neutral-300">Invite new member:</span>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="colleague@yourcompany.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg px-3 py-1.5 text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 flex-1 min-w-0"
                  required
                />
                <select
                  value={invitePermission}
                  onChange={(e) => setInvitePermission(e.target.value)}
                  className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="read">Read Only</option>
                  <option value="write">Read & Write</option>
                </select>
                <button
                  type="submit"
                  disabled={inviteLoading || !inviteEmail.trim()}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition disabled:opacity-50 disabled:cursor-not-allowed shrink-0 cursor-pointer"
                >
                  {inviteLoading ? "Inviting..." : "Invite"}
                </button>
              </div>
            </form>

            <div className="border-t border-neutral-850 my-1"></div>

            {workspaceMembersLoading ? (
              <div className="py-12 flex flex-col items-center gap-3">
                <RefreshCw className="h-8 w-8 text-neutral-600 animate-spin" />
                <span className="text-xs text-neutral-500">Loading members list...</span>
              </div>
            ) : (
              <form onSubmit={handleWorkspaceMembersSubmit} className="flex flex-col gap-4">
                <div className="max-h-[200px] overflow-y-auto pr-1 flex flex-col gap-2.5">
                  {workspaceMembersList.map((member) => (
                    <div
                      key={member.user_id || member.email}
                      className="bg-neutral-950/40 border border-neutral-850 rounded-xl p-3 flex items-center justify-between gap-4"
                    >
                      <div className="flex flex-col min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-neutral-200 truncate">{member.name}</span>
                          {member.is_pending && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                              Invited
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-neutral-500 truncate">{member.email}</span>
                      </div>

                      {member.is_owner ? (
                        <span className="text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-2 py-0.5 rounded-full font-bold">
                          Owner
                        </span>
                      ) : (
                        <div className="flex items-center gap-3 shrink-0">
                          {/* Toggle Access */}
                          <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={member.has_access}
                              onChange={() => toggleWorkspaceMemberAccess(member.user_id, member.email)}
                              className="rounded border-neutral-800 bg-neutral-950 text-blue-500 focus:ring-blue-500 h-4 w-4"
                            />
                            Access
                          </label>

                          {/* Permission Selection */}
                          {member.has_access && (
                            <select
                              value={member.permission}
                              onChange={(e) => changeWorkspaceMemberPermission(member.user_id, member.email, e.target.value)}
                              className="bg-neutral-900 border border-neutral-800 rounded-lg px-2 py-1 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="read">Read Only</option>
                              <option value="write">Read & Write</option>
                            </select>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {workspaceMembersList.length === 0 && (
                    <div className="py-8 text-center text-xs text-neutral-500">
                      No other users found in your organization.
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2.5 justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => setIsWorkspaceMembersModalOpen(false)}
                    className="bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-200 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={workspaceMembersSaveLoading}
                    className="bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-95 text-white font-semibold px-4 py-2 rounded-xl text-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {workspaceMembersSaveLoading ? "Saving..." : "Save Mappings"}
                  </button>
                </div>
              </form>
            )}

          </div>
        </div>
      )}

      {/* Admin Panel: User Modal */}
      {isAdminUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative flex flex-col gap-4 mx-4">
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-bold text-lg mb-1">
                <Sparkles className="h-5 w-5" />
                <span>{selectedAdminUser ? "Edit User Account" : "Create User Account"}</span>
              </div>
              <p className="text-xs text-neutral-400">
                Configure profile name, credentials, and global system authorization role.
              </p>
            </div>

            {adminUserError && (
              <div className="bg-red-950/40 border border-red-900/30 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{adminUserError}</span>
              </div>
            )}

            <form onSubmit={handleAdminUserSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Full Name</label>
                <input
                  type="text"
                  required
                  value={adminUserNameInput}
                  onChange={(e) => setAdminUserNameInput(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Email Address</label>
                <input
                  type="email"
                  required
                  value={adminUserEmailInput}
                  onChange={(e) => setAdminUserEmailInput(e.target.value)}
                  placeholder="e.g. user@company.com"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Authorization Role</label>
                <select
                  value={adminUserRoleInput}
                  onChange={(e) => setAdminUserRoleInput(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all text-neutral-300"
                >
                  <option value="executive">Executive (Workspace Owner/Manager)</option>
                  <option value="ea">Executive Assistant (Multi-Tenant Access)</option>
                  <option value="admin">System Administrator (Full Global Control)</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">
                  Password {selectedAdminUser && <span className="text-[10px] text-neutral-500">(Leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  required={!selectedAdminUser}
                  value={adminUserPasswordInput}
                  onChange={(e) => setAdminUserPasswordInput(e.target.value)}
                  placeholder={selectedAdminUser ? "••••••••" : "Type secure password"}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="flex items-center gap-2.5 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setIsAdminUserModalOpen(false)}
                  className="bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-200 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminUserLoading || !adminUserNameInput.trim() || !adminUserEmailInput.trim()}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-95 text-white font-semibold px-4 py-2 rounded-xl text-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {adminUserLoading ? "Saving..." : selectedAdminUser ? "Update User" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Panel: Workspace Modal */}
      {isAdminWorkspaceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative flex flex-col gap-4 mx-4">
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-bold text-lg mb-1">
                <Sparkles className="h-5 w-5" />
                <span>{selectedAdminWorkspace ? "Edit Executive Workspace" : "Create Executive Workspace"}</span>
              </div>
              <p className="text-xs text-neutral-400">
                Configure properties and map ownership of the tenant workspace.
              </p>
            </div>

            {adminWorkspaceError && (
              <div className="bg-red-950/40 border border-red-900/30 rounded-xl p-3 text-xs text-red-400 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{adminWorkspaceError}</span>
              </div>
            )}

            <form onSubmit={handleAdminWorkspaceSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Executive Name</label>
                <input
                  type="text"
                  required
                  value={adminWorkspaceNameInput}
                  onChange={(e) => setAdminWorkspaceNameInput(e.target.value)}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Role / Position</label>
                <input
                  type="text"
                  required
                  value={adminWorkspaceRoleInput}
                  onChange={(e) => setAdminWorkspaceRoleInput(e.target.value)}
                  placeholder="e.g. CEO"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Workspace Email Address</label>
                <input
                  type="email"
                  required
                  value={adminWorkspaceEmailInput}
                  onChange={(e) => setAdminWorkspaceEmailInput(e.target.value)}
                  placeholder="e.g. sarah.j@company.com"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Avatar Image URL (Optional)</label>
                <input
                  type="url"
                  value={adminWorkspaceAvatarInput}
                  onChange={(e) => setAdminWorkspaceAvatarInput(e.target.value)}
                  placeholder="e.g. https://unsplash.com/..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-300">Assign Owner Account</label>
                <select
                  value={adminWorkspaceOwnerInput}
                  onChange={(e) => setAdminWorkspaceOwnerInput(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3.5 py-2 text-sm text-neutral-200 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all text-neutral-350"
                >
                  <option value="">Unassigned (Seed / Demo Mode)</option>
                  {adminUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email}) [{u.role}]</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2.5 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setIsAdminWorkspaceModalOpen(false)}
                  className="bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-200 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminWorkspaceLoading || !adminWorkspaceNameInput.trim() || !adminWorkspaceRoleInput.trim() || !adminWorkspaceEmailInput.trim()}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-95 text-white font-semibold px-4 py-2 rounded-xl text-xs transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {adminWorkspaceLoading ? "Saving..." : selectedAdminWorkspace ? "Update Workspace" : "Create Workspace"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Panel: Mapping Modal */}
      {isMappingModalOpen && mappingWorkspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 w-full max-w-md shadow-2xl relative flex flex-col gap-4 mx-4">
            <div>
              <div className="flex items-center gap-2 text-blue-400 font-bold text-lg mb-1">
                <Users className="h-5 w-5" />
                <span>Manage Workspace Mappings</span>
              </div>
              <p className="text-xs text-neutral-400">
                Authorize specific Assistant (EA) or Executive accounts to access the workspace for <strong>{mappingWorkspace.name}</strong>.
              </p>
            </div>

            <form onSubmit={handleMappingSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1">
                {adminUsers.map((u) => {
                  const isChecked = mappingSelectedUserIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-3 bg-neutral-950/40 hover:bg-neutral-950 border border-neutral-850 p-2.5 rounded-xl cursor-pointer transition text-sm text-neutral-250 select-none"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setMappingSelectedUserIds(prev => [...prev, u.id]);
                          } else {
                            setMappingSelectedUserIds(prev => prev.filter(id => id !== u.id));
                          }
                        }}
                        className="rounded border-neutral-800 bg-neutral-950 text-blue-500 focus:ring-blue-500 h-4.5 w-4.5 transition cursor-pointer"
                      />
                      <div>
                        <p className="font-semibold text-white leading-tight">{u.name}</p>
                        <p className="text-[10px] text-neutral-500 mt-0.5">{u.email} &mdash; <span className="capitalize">{u.role}</span></p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex items-center gap-2.5 justify-end mt-2">
                <button
                  type="button"
                  onClick={() => setIsMappingModalOpen(false)}
                  className="bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 text-neutral-200 font-semibold px-4 py-2 rounded-xl text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={mappingLoading}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-95 text-white font-semibold px-4 py-2 rounded-xl text-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {mappingLoading ? "Saving..." : "Save Mappings"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Floating Notification / Toast */}
      {notification && (
        <div className="fixed bottom-6 right-6 bg-neutral-900 border border-neutral-800 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 z-50 animate-in fade-in slide-in-from-bottom-4 duration-300">
          {notification.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-red-400" />
          )}
          <span className="text-sm font-semibold">{notification.message}</span>
        </div>
      )}
    </main>
  );
}
