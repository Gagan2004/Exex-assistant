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
  RefreshCw
} from "lucide-react";

interface Executive {
  id: string;
  name: string;
  role: string;
  avatar: string;
  email: string;
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




  // Fetch initial data
  useEffect(() => {
    fetchExecutives();
  }, []);

  useEffect(() => {
    if (selectedExec) {
      fetchDashboard(selectedExec.id);
      fetchAuthStatus(selectedExec.id);
      fetchMeetings(selectedExec.id);
    }
  }, [selectedExec]);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const fetchAuthStatus = async (execId: string) => {
    try {
      const res = await fetch(`${backendUrl}/api/auth/status?executive_id=${execId}`);
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
      const res = await fetch(`${backendUrl}/api/auth/${provider}/url?executive_id=${selectedExec.id}`);
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
      const res = await fetch(`${backendUrl}/api/auth/disconnect?executive_id=${selectedExec.id}&provider=${provider}`, {
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
      const res = await fetch(`${backendUrl}/api/executives`);
      if (res.ok) {
        const data = await res.json();
        setExecutives(data);
        if (data.length > 0) {
          setSelectedExec(data[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch executives from backend. Using mock fallback.", err);
      // Mock fallback
      const mockData: Executive[] = [
        { id: "exec_1", name: "Sarah Jenkins", role: "CEO", avatar: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150", email: "sarah.j@company.com" },
        { id: "exec_2", name: "David Kross", role: "CFO", avatar: "https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=150", email: "david.k@company.com" },
        { id: "exec_3", name: "Elena Rostova", role: "CTO", avatar: "https://images.unsplash.com/photo-1580489944761-15a19d654956?w=150", email: "elena.r@company.com" },
      ];
      setExecutives(mockData);
      setSelectedExec(mockData[0]);
    }
  };

  const fetchDashboard = async (execId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`${backendUrl}/api/dashboard?executive_id=${execId}`);
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
      const res = await fetch(`${backendUrl}/api/meetings?executive_id=${execId}`);
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
      const res = await fetch(`${backendUrl}/api/action/${status}?action_id=${actionId}`, {
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
      const res = await fetch(`${backendUrl}/api/${endpoint}?executive_id=${selectedExec.id}&text=${encodeURIComponent(directiveText)}`, {
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
      const res = await fetch(`${backendUrl}/api/action/create`, {
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
          {/* Connection status indicators */}
          <div className="flex items-center gap-2 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-full text-xs text-neutral-400">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Backend: {backendUrl}
          </div>
        </div>
      </header>

      {/* Workspace Wrapper */}
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
                      className="text-[9px] bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-900/30 px-2 py-0.5 rounded transition-all cursor-pointer"
                      title="Disconnect / Sign Out Google Account"
                    >
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => syncCalendar("google")}
                    className="text-[10px] bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded font-bold cursor-pointer transition-colors"
                  >
                    Sync
                  </button>
                )}
              </div>
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

              <button
                onClick={() => fetchDashboard(selectedExec.id)}
                className="bg-neutral-800/80 hover:bg-neutral-800 text-neutral-300 hover:text-white p-2.5 rounded-xl border border-neutral-700 transition"
                title="Refresh tasks"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
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
                  placeholder="Type or dictate an instruction... (e.g., 'Schedule meeting with Dave for next Monday at 2 PM')"
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl p-4 pr-14 text-sm text-neutral-200 placeholder-neutral-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all min-h-[90px] resize-none"
                />
                <button
                  type="button"
                  onClick={handleVoiceRecord}
                  className={`absolute right-3 bottom-3 p-3 rounded-full transition-all duration-300 cursor-pointer ${isRecording
                      ? "bg-red-500 animate-pulse text-white shadow-lg shadow-red-500/20"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20"
                    }`}
                  title="Voice Record"
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
                  disabled={!directiveText.trim()}
                  className="bg-gradient-to-r from-blue-600 to-violet-600 disabled:from-neutral-800 disabled:to-neutral-850 disabled:text-neutral-600 text-white font-semibold text-sm px-5 py-2.5 rounded-xl flex items-center gap-2 transition hover:opacity-95 shadow-md shadow-blue-900/10 cursor-pointer"
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
                        className="flex-1 bg-neutral-900 border border-neutral-800 hover:bg-red-950/20 hover:border-red-900/50 hover:text-red-400 text-neutral-400 font-semibold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <X className="h-3.5 w-3.5" /> Reject
                      </button>
                      <button
                        onClick={() => handleAction(action.id, "approve")}
                        className="flex-1 bg-gradient-to-r from-blue-600 to-violet-600 hover:opacity-95 text-white font-semibold py-2 rounded-lg text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
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
