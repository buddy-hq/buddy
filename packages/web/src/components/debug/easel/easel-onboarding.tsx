import { useState, useRef, useEffect } from "react"
import { Button, Input, Textarea, Badge, cn } from "@buddy/ui"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Folder,
  Sparkles,
  Info,
  FileText,
  MessageSquare,
  Settings,
  HelpCircle,
  Check,
} from "lucide-react"

// Import mascot assets directly
import buddyMascotWaveUrl from "../../../../../../assets/mascot/buddy-mascot-wave.png"
import buddyMascotPeekUrl from "../../../../../../assets/mascot/buddy-mascot-peek.png"
import buddyMascotApproveUrl from "../../../../../../assets/mascot/buddy-mascot-approve.png"

type InterviewConceptID = "standard" | "scrolling" | "chatSim" | "splitScreen" | "hud"

type OnboardingOption = "overview" | InterviewConceptID

type OnboardingData = {
  preferredName: string
  authChoice: "chatgpt_plus" | "free_models" | undefined
  storageFolder: string
  occupation: string
  moreAboutYou: string
}

const DEFAULT_DATA: OnboardingData = {
  preferredName: "",
  authChoice: undefined,
  storageFolder: "~/Documents/Buddy",
  occupation: "",
  moreAboutYou: "",
}

type FloatingNotesProps = {
  title: string
  isNotesOpen: boolean
  setIsNotesOpen: (open: boolean) => void
  bullets: (string | boolean | null)[]
}

function FloatingNotes(props: FloatingNotesProps) {
  return (
    <div className="absolute bottom-5 right-5 z-40 flex flex-col items-end font-sans">
      {props.isNotesOpen ? (
        <div className="mb-3 w-80 bg-background-base/95 backdrop-blur-md border border-border-base rounded-2xl p-5 shadow-2xl animate-in slide-in-from-bottom-2 duration-150 space-y-4">
          <div className="flex items-center justify-between border-b border-border-weaker-base pb-2">
            <span className="text-[11px] font-bold text-text-strong uppercase tracking-wider">
              {props.title}
            </span>
            <button
              type="button"
              onClick={() => props.setIsNotesOpen(false)}
              className="text-[10px] font-bold text-text-weaker hover:text-text-strong cursor-pointer"
            >
              Hide
            </button>
          </div>
          <div className="space-y-3">
            <p className="text-[11px] text-text-weak leading-relaxed font-semibold">
              💡 Onboarding Insights:
            </p>
            <ul className="text-[10px] text-text-weak space-y-2 list-disc list-inside leading-relaxed">
              {props.bullets
                .filter((b): b is string => typeof b === "string")
                .map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
            </ul>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => props.setIsNotesOpen(!props.isNotesOpen)}
        className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-background-base border border-border-base hover:bg-surface-raised-base text-[10px] font-bold text-text-strong shadow-lg transition-all cursor-pointer"
      >
        <Info className="size-3.5 text-text-interactive-base" />{" "}
        {props.isNotesOpen ? "Hide Insights" : "Show Insights"}
      </button>
    </div>
  )
}

function OpenAIIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364l2.0201-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z" />
    </svg>
  )
}

function PulsingRing({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 16 16" fill="none">
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="12 20"
        className="origin-center animate-spin"
        style={{ animationDuration: "1.2s" }}
      />
    </svg>
  )
}

export function EaselOnboarding() {
  const [activeConcept, setActiveConcept] = useState<InterviewConceptID>("standard")
  const [activeTab, setActiveTab] = useState<OnboardingOption>("overview")
  const [data, setData] = useState<OnboardingData>(DEFAULT_DATA)

  // Concept Steps
  const [standardStep, setStandardStep] = useState<number>(0)
  const [splitStep, setSplitStep] = useState<number>(0)
  const [hudStep, setHudStep] = useState<number>(0)

  // Scrolling Step Reveal
  const [scrollReached, setScrollReached] = useState<number>(0) // 0: Name, 1: Engine, 2: Folder, 3: Personalization, 4: Finish

  // Simulated ChatGPT OAuth spinner triggers
  const [isOAuthBusy, setIsOAuthBusy] = useState(false)

  // Chat Simulator State
  type ChatMessage = {
    id: string
    sender: "buddy" | "user"
    text: string
    formType?: "name" | "engine" | "folder" | "personalization" | "done"
  }
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInputText, setChatInputText] = useState("")
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // Floating design notes open/close state
  const [isNotesOpen, setIsNotesOpen] = useState(true)

  // Folder Pick Dialog Sim
  const [isFolderPickerOpen, setIsFolderPickerOpen] = useState(false)
  const [customFolderInput, setCustomFolderInput] = useState("~/Documents/Buddy")

  const resetAll = () => {
    setData(DEFAULT_DATA)
    setStandardStep(0)
    setSplitStep(0)
    setHudStep(0)
    setScrollReached(0)
    setIsOAuthBusy(false)
    setChatMessages([
      {
        id: "m1",
        sender: "buddy",
        text: "Welcome! I'm Buddy. Let's configure your local database workspace. First, what is your preferred name?",
        formType: "name",
      },
    ])
    setChatInputText("")
  }

  // Handle concept triggers
  useEffect(() => {
    resetAll()
  }, [activeConcept, activeTab])

  // Scroll chat simulator to bottom
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" })
    }
  }, [chatMessages])

  const handleFolderSelect = (path: string) => {
    setData((prev) => ({ ...prev, storageFolder: path }))
    setIsFolderPickerOpen(false)
  }

  // Helper to trigger simulated OAuth connection flow
  const triggerSimulatedOAuth = (onComplete: () => void) => {
    setIsOAuthBusy(true)
    setTimeout(() => {
      setIsOAuthBusy(false)
      onComplete()
    }, 1800)
  }

  // --- Concept 1: Standard Step-by-Step Interview ---
  const renderStandard = () => {
    return (
      <div className="relative flex flex-col h-full w-full bg-surface-inset-base p-8 items-center justify-center min-h-0 font-sans">
        {/* Simulated OAuth Modal */}
        {isOAuthBusy && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background-base/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-border-base bg-surface-base p-8 text-center shadow-lg">
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border-success-base/30 bg-surface-success-weak">
                <OpenAIIcon className="size-6 text-icon-success-base" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-text-strong">
                Connecting ChatGPT Plus
              </h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-text-weak">
                Please complete authorization in your default web browser...
              </p>
              <div className="mt-8 flex items-center justify-center gap-3 rounded-full border border-border-success-base/30 bg-surface-success-weak px-4 py-2 text-xs font-semibold text-text-on-success-weak">
                <PulsingRing />
                Waiting for OAuth response
              </div>
              <Button
                variant="outline"
                className="mt-8 w-full rounded-xl"
                onClick={() => setIsOAuthBusy(false)}
              >
                Cancel Sign In
              </Button>
            </div>
          </div>
        )}

        <div className="w-full h-full max-w-4xl bg-background-base rounded-2xl border border-border-base shadow-2xl overflow-hidden flex flex-col">
          {/* Electron window chrome */}
          <div className="h-11 bg-surface-raised-base border-b border-border-weaker-base px-5 flex items-center justify-between shrink-0">
            <div className="flex gap-2">
              <span className="size-3 rounded-full bg-surface-critical-base" />
              <span className="size-3 rounded-full bg-surface-warning-base" />
              <span className="size-3 rounded-full bg-surface-success-base" />
            </div>
            <span className="text-xs font-semibold text-text-weaker">Buddy — Onboarding Setup</span>
            <div className="flex gap-1.5">
              <span
                className={cn(
                  "size-2 rounded-full",
                  standardStep >= 0 ? "bg-surface-interactive-base" : "bg-border-base",
                )}
              />
              <span
                className={cn(
                  "size-2 rounded-full",
                  standardStep >= 1 ? "bg-surface-interactive-base" : "bg-border-base",
                )}
              />
              <span
                className={cn(
                  "size-2 rounded-full",
                  standardStep >= 2 ? "bg-surface-interactive-base" : "bg-border-base",
                )}
              />
              <span
                className={cn(
                  "size-2 rounded-full",
                  standardStep >= 3 ? "bg-surface-interactive-base" : "bg-border-base",
                )}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-12 flex flex-col justify-between min-h-0 bg-gradient-to-b from-background-base to-surface-base/20">
            {standardStep === 0 && (
              <div className="flex flex-col items-center text-center space-y-6 my-auto animate-in fade-in zoom-in-95 duration-200">
                <img
                  src={buddyMascotWaveUrl}
                  alt="Mascot Waving"
                  className="w-24 h-24 object-contain animate-bounce"
                />
                <div className="space-y-2">
                  <h2 className="text-2xl font-extrabold tracking-tight">
                    "Welcome! Let's get to know you."
                  </h2>
                  <p className="text-sm text-text-weak">First, what is your preferred name?</p>
                </div>
                <Input
                  value={data.preferredName}
                  placeholder="Your preferred name"
                  onChange={(e) => setData((prev) => ({ ...prev, preferredName: e.target.value }))}
                  className="h-10 text-xs max-w-xs text-center font-bold bg-background-base rounded-xl"
                />
                <Button
                  disabled={!data.preferredName.trim()}
                  onClick={() => setStandardStep(1)}
                  className="rounded-xl px-8 font-semibold shadow-sm"
                >
                  Introduce Yourself <ArrowRight className="size-4 ml-2" />
                </Button>
              </div>
            )}

            {standardStep === 1 && (
              <div className="flex flex-col h-full justify-between animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="space-y-6 max-w-2xl mx-auto w-full pt-4">
                  <div className="space-y-2 text-center">
                    <img
                      src={buddyMascotPeekUrl}
                      alt="Mascot Peek"
                      className="w-20 h-20 object-contain mx-auto"
                    />
                    <h2 className="text-2xl font-extrabold text-text-strong tracking-tight">
                      "Connect your AI Engine"
                    </h2>
                    <p className="text-sm text-text-weak">
                      Buddy processes code, reviews, and vocabulary through this core connection.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                    {/* ChatGPT Plus Card */}
                    <button
                      type="button"
                      onClick={() => {
                        triggerSimulatedOAuth(() => {
                          setData((prev) => ({ ...prev, authChoice: "chatgpt_plus" }))
                          setStandardStep(2)
                        })
                      }}
                      className={cn(
                        "p-6 rounded-2xl border text-left transition-all flex flex-col justify-between h-40 hover:bg-surface-raised-base cursor-pointer hover:scale-[1.02]",
                        data.authChoice === "chatgpt_plus"
                          ? "border-border-success-base bg-surface-success-weak shadow-xs"
                          : "border-border-base bg-surface-raised-base",
                      )}
                    >
                      <div className="flex size-9 items-center justify-center rounded-xl border border-border-success-base/20 bg-surface-success-weak">
                        <OpenAIIcon className="size-4 text-icon-success-base" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-text-strong">ChatGPT Plus</h4>
                          {data.authChoice === "chatgpt_plus" && (
                            <span className="flex items-center gap-0.5 rounded-full bg-surface-success-base/10 px-2 py-0.5 text-[9px] font-bold text-text-success-base border border-border-success-base/20">
                              Connected
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-weak mt-1">
                          Connect your ChatGPT account to use GPT-4o models directly.
                        </p>
                      </div>
                    </button>

                    {/* Free Models Card */}
                    <button
                      type="button"
                      onClick={() => {
                        setData((prev) => ({ ...prev, authChoice: "free_models" }))
                        setStandardStep(2)
                      }}
                      className={cn(
                        "p-6 rounded-2xl border text-left transition-all flex flex-col justify-between h-40 hover:bg-surface-raised-base cursor-pointer hover:scale-[1.02]",
                        data.authChoice === "free_models"
                          ? "border-border-interactive-base bg-surface-interactive-weak shadow-xs"
                          : "border-border-base bg-surface-raised-base",
                      )}
                    >
                      <div className="flex size-9 items-center justify-center rounded-xl border border-border-base bg-surface-base">
                        <svg
                          className="size-4 text-icon-base"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-text-strong">
                            Free built-in models
                          </h4>
                        </div>
                        <p className="text-xs text-text-weak mt-1">
                          Local-first, zero credentials. Pre-configured and private.
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-auto pt-6 border-t border-border-weaker-base max-w-2xl mx-auto w-full">
                  <Button variant="ghost" onClick={() => setStandardStep(0)}>
                    <ArrowLeft className="size-4 mr-2" /> Back
                  </Button>
                  <Button
                    disabled={!data.authChoice}
                    onClick={() => setStandardStep(2)}
                    className="rounded-xl px-6 font-semibold"
                  >
                    Next <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {standardStep === 2 && (
              <div className="flex flex-col h-full justify-between animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="space-y-6 max-w-2xl mx-auto w-full pt-4">
                  <div className="space-y-1.5 text-center">
                    <h2 className="text-2xl font-extrabold text-text-strong tracking-tight">
                      "Where should we store your notes?"
                    </h2>
                    <p className="text-sm text-text-weak">
                      We'll initialize your workspace directory. This folder will hold all your
                      files and flashcards.
                    </p>
                  </div>

                  <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-4 rounded-2xl border border-border-base bg-surface-raised-base p-5">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-base bg-surface-base">
                        <Folder className="size-5 text-icon-base" />
                      </div>
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-3 text-sm">
                        <div>
                          <p className="font-bold text-text-strong">Workspace Storage Location</p>
                          <p className="text-xs text-text-weak mt-0.5 truncate">
                            {data.storageFolder}
                          </p>
                        </div>
                        <Check className="size-5 text-text-success-base shrink-0" />
                      </div>
                    </div>

                    <div className="flex gap-4">
                      <Button
                        type="button"
                        onClick={() => setStandardStep(3)}
                        className="flex-1 h-12 rounded-xl text-xs font-bold"
                      >
                        Use Default Location
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsFolderPickerOpen(true)}
                        className="flex-1 h-12 rounded-xl text-xs font-bold"
                      >
                        Choose custom folder...
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-auto pt-6 border-t border-border-weaker-base max-w-2xl mx-auto w-full">
                  <Button variant="ghost" onClick={() => setStandardStep(1)}>
                    <ArrowLeft className="size-4 mr-2" /> Back
                  </Button>
                  <Button
                    onClick={() => setStandardStep(3)}
                    className="rounded-xl px-6 font-semibold"
                  >
                    Next <ArrowRight className="size-4 ml-2" />
                  </Button>
                </div>
              </div>
            )}

            {standardStep === 3 && (
              <div className="flex flex-col h-full justify-between animate-in fade-in slide-in-from-right-4 duration-200">
                <div className="space-y-6 max-w-xl mx-auto w-full pt-4">
                  <div className="space-y-2 text-center">
                    <img
                      src={buddyMascotApproveUrl}
                      alt="Mascot Celebrate"
                      className="w-20 h-20 object-contain mx-auto"
                    />
                    <h2 className="text-2xl font-extrabold text-text-strong tracking-tight">
                      "Make Buddy your own"
                    </h2>
                    <p className="text-sm text-text-weak">
                      Personalize your setup goals and context. You can skip this step if you'd
                      like.
                    </p>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-text-weak uppercase tracking-wider">
                        Occupation
                      </label>
                      <Input
                        placeholder="e.g. Student, engineer, researcher"
                        value={data.occupation}
                        onChange={(e) =>
                          setData((prev) => ({ ...prev, occupation: e.target.value }))
                        }
                        className="h-10 text-xs rounded-lg border-border-base bg-background-base"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-text-weak uppercase tracking-wider">
                        Goals & Context
                      </label>
                      <Textarea
                        placeholder="What are your study interests, goals, or context?"
                        value={data.moreAboutYou}
                        onChange={(e) =>
                          setData((prev) => ({ ...prev, moreAboutYou: e.target.value }))
                        }
                        className="text-xs rounded-lg border-border-base bg-background-base min-h-[90px]"
                        rows={3}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-auto pt-6 border-t border-border-weaker-base max-w-2xl mx-auto w-full">
                  <Button variant="ghost" onClick={() => setStandardStep(2)}>
                    <ArrowLeft className="size-4 mr-2" /> Back
                  </Button>
                  <div className="flex gap-3">
                    <Button variant="ghost" onClick={() => setStandardStep(4)}>
                      Skip
                    </Button>
                    <Button
                      onClick={() => setStandardStep(4)}
                      className="rounded-xl px-6 font-semibold"
                    >
                      Finish Setup <ArrowRight className="size-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {standardStep === 4 && renderMockWorkspace()}
          </div>
        </div>

        <FloatingNotes
          title="Option 1: Standard Interview"
          isNotesOpen={isNotesOpen}
          setIsNotesOpen={setIsNotesOpen}
          bullets={[
            "Classic wizard card layout.",
            "Integrates ChatGPT Plus OAuth loading spinner mock matching production.",
            "Captures the exact personalization fields (Preferred Name, Occupation, moreAboutYou).",
            "Folder selection mirrors default vs manual directories.",
          ]}
        />
      </div>
    )
  }

  // --- Concept 2: Continuous Scroll Inline Interview ---
  const renderScrolling = () => {
    return (
      <div className="relative flex flex-col h-full w-full bg-surface-inset-base p-8 items-center justify-center min-h-0 font-sans">
        {/* Simulated OAuth Modal */}
        {isOAuthBusy && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background-base/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-border-base bg-surface-base p-8 text-center shadow-lg">
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border-success-base/30 bg-surface-success-weak">
                <OpenAIIcon className="size-6 text-icon-success-base" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-text-strong">
                Connecting ChatGPT Plus
              </h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-text-weak">
                Confirm browser connection...
              </p>
              <div className="mt-8 flex items-center justify-center gap-3 rounded-full border border-border-success-base/30 bg-surface-success-weak px-4 py-2 text-xs font-semibold text-text-on-success-weak">
                <PulsingRing />
                Waiting for browser
              </div>
            </div>
          </div>
        )}

        <div className="w-full h-full max-w-2xl bg-background-base rounded-2xl border border-border-base shadow-2xl overflow-hidden flex flex-col">
          <div className="h-11 bg-surface-raised-base border-b border-border-weaker-base px-5 flex items-center justify-between shrink-0">
            <div className="flex gap-2">
              <span className="size-3 rounded-full bg-surface-critical-base" />
              <span className="size-3 rounded-full bg-surface-warning-base" />
              <span className="size-3 rounded-full bg-surface-success-base" />
            </div>
            <span className="text-xs font-semibold text-text-weaker">
              Buddy — Inline Scrolling Setup
            </span>
            <span className="w-12" />
          </div>

          <div className="flex-1 overflow-y-auto p-10 space-y-8 bg-gradient-to-b from-background-base to-surface-base/10">
            {/* Step 1: Name */}
            <div className="space-y-3 max-w-md animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center gap-3">
                <Badge
                  variant="outline"
                  className="bg-surface-interactive-weak text-text-interactive-base border-transparent text-[10px] h-5 font-bold"
                >
                  01
                </Badge>
                <h3 className="font-extrabold text-sm text-text-strong">
                  What is your preferred name?
                </h3>
              </div>
              <div className="flex gap-3">
                <Input
                  disabled={scrollReached > 0}
                  value={data.preferredName}
                  placeholder="Enter name"
                  onChange={(e) => setData((prev) => ({ ...prev, preferredName: e.target.value }))}
                  className="h-9 text-xs max-w-xs bg-background-base"
                />
                {scrollReached === 0 && (
                  <Button
                    disabled={!data.preferredName.trim()}
                    onClick={() => setScrollReached(1)}
                    className="h-9 text-xs rounded-lg"
                  >
                    Confirm
                  </Button>
                )}
              </div>
            </div>

            {/* Step 2: Engine Selection */}
            {scrollReached >= 1 && (
              <div className="space-y-4 pt-4 border-t border-border-weaker-base animate-in fade-in slide-in-from-bottom-3 duration-350">
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className="bg-surface-interactive-weak text-text-interactive-base border-transparent text-[10px] h-5 font-bold"
                  >
                    02
                  </Badge>
                  <h3 className="font-extrabold text-sm text-text-strong">
                    Connect your AI Engine
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-md">
                  <button
                    disabled={scrollReached > 1}
                    type="button"
                    onClick={() => {
                      triggerSimulatedOAuth(() => {
                        setData((prev) => ({ ...prev, authChoice: "chatgpt_plus" }))
                        setScrollReached(2)
                      })
                    }}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all hover:bg-surface-raised-base cursor-pointer",
                      data.authChoice === "chatgpt_plus"
                        ? "border-border-success-base bg-surface-success-weak"
                        : "border-border-base bg-surface-base",
                    )}
                  >
                    <div className="flex size-7 items-center justify-center rounded-lg bg-surface-success-weak text-icon-success-base mb-2">
                      <OpenAIIcon className="size-3.5" />
                    </div>
                    <span className="font-bold text-xs text-text-strong">ChatGPT Plus</span>
                  </button>

                  <button
                    disabled={scrollReached > 1}
                    type="button"
                    onClick={() => {
                      setData((prev) => ({ ...prev, authChoice: "free_models" }))
                      setScrollReached(2)
                    }}
                    className={cn(
                      "p-4 rounded-xl border text-left transition-all hover:bg-surface-raised-base cursor-pointer",
                      data.authChoice === "free_models"
                        ? "border-border-interactive-base bg-surface-interactive-weak"
                        : "border-border-base bg-surface-base",
                    )}
                  >
                    <div className="flex size-7 items-center justify-center rounded-lg bg-surface-base text-icon-base mb-2">
                      <Folder className="size-3.5" />
                    </div>
                    <span className="font-bold text-xs text-text-strong">Free built-in models</span>
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Folder Selection */}
            {scrollReached >= 2 && (
              <div className="space-y-4 pt-4 border-t border-border-weaker-base animate-in fade-in slide-in-from-bottom-3 duration-350">
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className="bg-surface-interactive-weak text-text-interactive-base border-transparent text-[10px] h-5 font-bold"
                  >
                    03
                  </Badge>
                  <h3 className="font-extrabold text-sm text-text-strong">
                    Where should we store your workspace folder?
                  </h3>
                </div>

                <div className="space-y-3 max-w-md">
                  <div className="p-3 bg-surface-raised-base border border-border-weaker-base rounded-xl flex items-center justify-between text-xs">
                    <span className="truncate text-text-weak">{data.storageFolder}</span>
                    <button
                      disabled={scrollReached > 2}
                      type="button"
                      onClick={() => setIsFolderPickerOpen(true)}
                      className="font-bold text-text-interactive-base hover:underline cursor-pointer"
                    >
                      Change
                    </button>
                  </div>
                </div>

                {scrollReached === 2 && (
                  <Button
                    onClick={() => setScrollReached(3)}
                    className="h-9 text-xs rounded-lg mt-1"
                  >
                    Use Default Path
                  </Button>
                )}
              </div>
            )}

            {/* Step 4: Personalization (Form Fields) */}
            {scrollReached >= 3 && (
              <div className="space-y-4 pt-4 border-t border-border-weaker-base animate-in fade-in slide-in-from-bottom-3 duration-350">
                <div className="flex items-center gap-3">
                  <Badge
                    variant="outline"
                    className="bg-surface-interactive-weak text-text-interactive-base border-transparent text-[10px] h-5 font-bold"
                  >
                    04
                  </Badge>
                  <h3 className="font-extrabold text-sm text-text-strong">Personalize Buddy</h3>
                </div>

                <div className="space-y-4 max-w-md">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-weak uppercase tracking-wider">
                      Occupation
                    </label>
                    <Input
                      disabled={scrollReached > 3}
                      value={data.occupation}
                      placeholder="e.g. Student, engineer"
                      onChange={(e) => setData((prev) => ({ ...prev, occupation: e.target.value }))}
                      className="h-9 text-xs bg-background-base"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-weak uppercase tracking-wider">
                      More About You
                    </label>
                    <Textarea
                      disabled={scrollReached > 3}
                      value={data.moreAboutYou}
                      placeholder="Goals, preferences, context..."
                      onChange={(e) =>
                        setData((prev) => ({ ...prev, moreAboutYou: e.target.value }))
                      }
                      className="text-xs bg-background-base"
                      rows={3}
                    />
                  </div>

                  {scrollReached === 3 && (
                    <div className="flex gap-3 pt-2">
                      <Button
                        variant="ghost"
                        onClick={() => setScrollReached(4)}
                        className="h-9 text-xs"
                      >
                        Skip
                      </Button>
                      <Button
                        onClick={() => setScrollReached(4)}
                        className="h-9 text-xs rounded-lg flex-1"
                      >
                        Save & Complete
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {scrollReached === 4 && (
              <div className="pt-6 border-t border-border-weaker-base animate-in fade-in duration-300">
                {renderMockWorkspace()}
              </div>
            )}
          </div>
        </div>

        <FloatingNotes
          title="Option 2: Scrolling Setup"
          isNotesOpen={isNotesOpen}
          setIsNotesOpen={setIsNotesOpen}
          bullets={[
            "Questions reveal sequentially as you submit.",
            "Ensures smooth inline state transitions.",
            "Includes folder setups, connection oauth state, and profile variables.",
          ]}
        />
      </div>
    )
  }

  // --- Concept 3: Chat Simulator Onboarding ---
  const handleChatSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!chatInputText.trim()) return

    const userText = chatInputText.trim()
    const currentMsg = chatMessages[chatMessages.length - 1]
    if (!currentMsg || !currentMsg.formType) return

    const step = currentMsg.formType

    // 1. Add User response bubble
    const userMsgId = `um-${Date.now()}`
    setChatMessages((prev) => [...prev, { id: userMsgId, sender: "user", text: userText }])
    setChatInputText("")

    // 2. Process data and queue next Buddy reply
    setTimeout(() => {
      if (step === "name") {
        setData((prev) => ({ ...prev, preferredName: userText }))
        setChatMessages((prev) => [
          ...prev,
          {
            id: `bm-${Date.now()}`,
            sender: "buddy",
            text: `Nice to meet you, ${userText}! Which AI Engine core would you like to connect?`,
            formType: "engine",
          },
        ])
      } else if (step === "personalization") {
        setData((prev) => ({ ...prev, moreAboutYou: userText }))
        setChatMessages((prev) => [
          ...prev,
          {
            id: `bm-${Date.now()}`,
            sender: "buddy",
            text: "That's fantastic. I've stored these settings to customize our notes and flashcard reviews. Let's enter your workspace!",
            formType: "done",
          },
        ])
      }
    }, 600)
  }

  const handleChatFormSubmit = (step: "engine" | "folder", value: string) => {
    const userMsgId = `um-${Date.now()}`
    setChatMessages((prev) => [...prev, { id: userMsgId, sender: "user", text: value }])

    // Process and queue next buddy query
    setTimeout(() => {
      if (step === "engine") {
        const isChatGPT = value.includes("ChatGPT")
        setData((prev) => ({ ...prev, authChoice: isChatGPT ? "chatgpt_plus" : "free_models" }))

        let prepText = "Locked in the free built-in models."
        if (isChatGPT) {
          prepText = "Connected ChatGPT Plus account successfully via browser authorization."
        }

        setChatMessages((prev) => [
          ...prev,
          {
            id: `bm-${Date.now()}`,
            sender: "buddy",
            text: `${prepText} Next, where should we initialize your database folder?`,
            formType: "folder",
          },
        ])
      } else if (step === "folder") {
        setChatMessages((prev) => [
          ...prev,
          {
            id: `bm-${Date.now()}`,
            sender: "buddy",
            text: "Workspace storage verified. Lastly, tell me a little about what you are studying or engineering right now.",
            formType: "personalization",
          },
        ])
      }
    }, 600)
  }

  const renderChatSim = () => {
    const activeMsg = chatMessages[chatMessages.length - 1]
    const activeForm = activeMsg?.formType

    return (
      <div className="relative flex flex-col h-full w-full bg-surface-inset-base p-8 items-center justify-center min-h-0 font-sans">
        {/* Simulated OAuth Modal */}
        {isOAuthBusy && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background-base/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-border-base bg-surface-base p-8 text-center shadow-lg">
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border-success-base/30 bg-surface-success-weak">
                <OpenAIIcon className="size-6 text-icon-success-base" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-text-strong">
                Browser Authentication
              </h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-text-weak">
                Simulating OAuth pipeline...
              </p>
              <div className="mt-8 flex items-center justify-center gap-3 rounded-full border border-border-success-base/30 bg-surface-success-weak px-4 py-2 text-xs font-semibold text-text-on-success-weak">
                <PulsingRing />
                Waiting for client
              </div>
            </div>
          </div>
        )}

        <div className="w-full h-full max-w-4xl bg-background-base rounded-2xl border border-border-base shadow-2xl overflow-hidden flex flex-col">
          <div className="h-11 bg-surface-raised-base border-b border-border-weaker-base px-5 flex items-center justify-between shrink-0">
            <div className="flex gap-2">
              <span className="size-3 rounded-full bg-surface-critical-base" />
              <span className="size-3 rounded-full bg-surface-warning-base" />
              <span className="size-3 rounded-full bg-surface-success-base" />
            </div>
            <span className="text-xs font-semibold text-text-weaker">
              Buddy — Conversational Setup Chat
            </span>
            <span className="w-12" />
          </div>

          <div className="flex-1 flex flex-col justify-between min-h-0 bg-gradient-to-b from-background-base to-surface-base/10">
            {/* Chat Messages scroll area */}
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              {chatMessages.map((msg) => {
                const isBuddy = msg.sender === "buddy"
                return (
                  <div
                    key={msg.id}
                    className={cn("flex items-start gap-3", !isBuddy && "justify-end")}
                  >
                    {isBuddy && (
                      <div className="size-8 rounded-full border border-border-weaker-base bg-surface-raised-base shrink-0 flex items-center justify-center p-1.5 shadow-xs">
                        <img
                          src={buddyMascotPeekUrl}
                          alt="Buddy"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                    <div className="space-y-3 max-w-[70%]">
                      <div
                        className={cn(
                          "p-3 rounded-2xl text-xs leading-relaxed shadow-xs border",
                          isBuddy
                            ? "bg-surface-base border-border-weaker-base text-text-strong rounded-tl-none"
                            : "bg-surface-interactive-base border-border-interactive-base text-text-on-interactive-base rounded-tr-none",
                        )}
                      >
                        {msg.text}
                      </div>

                      {/* Choices blocks */}
                      {isBuddy && activeMsg.id === msg.id && activeForm === "engine" && (
                        <div className="flex gap-2.5 max-w-xs w-64 animate-in slide-in-from-bottom-2 duration-200">
                          <button
                            type="button"
                            onClick={() => {
                              triggerSimulatedOAuth(() => {
                                handleChatFormSubmit("engine", "ChatGPT Plus (Browser Connect)")
                              })
                            }}
                            className="flex-1 p-2.5 border border-border-weaker-base bg-background-base hover:bg-surface-raised-base text-center rounded-xl text-[10px] font-bold text-text-strong cursor-pointer"
                          >
                            ChatGPT Plus
                          </button>
                          <button
                            type="button"
                            onClick={() => handleChatFormSubmit("engine", "Free built-in models")}
                            className="flex-1 p-2.5 border border-border-weaker-base bg-background-base hover:bg-surface-raised-base text-center rounded-xl text-[10px] font-bold text-text-strong cursor-pointer"
                          >
                            Free models
                          </button>
                        </div>
                      )}

                      {isBuddy && activeMsg.id === msg.id && activeForm === "folder" && (
                        <div className="space-y-2 max-w-xs animate-in slide-in-from-bottom-2 duration-200">
                          <button
                            type="button"
                            onClick={() =>
                              handleChatFormSubmit("folder", `Use default: ${data.storageFolder}`)
                            }
                            className="w-full p-2.5 border border-border-weaker-base bg-background-base hover:bg-surface-raised-base text-left rounded-xl text-[10px] font-bold text-text-strong cursor-pointer"
                          >
                            Use default: {data.storageFolder}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setIsFolderPickerOpen(true)
                              // We wait for modal action
                            }}
                            className="w-full p-2.5 border border-border-weaker-base bg-background-base hover:bg-surface-raised-base text-left rounded-xl text-[10px] font-bold text-text-strong cursor-pointer"
                          >
                            Pick custom folder...
                          </button>
                        </div>
                      )}

                      {isBuddy && activeMsg.id === msg.id && activeForm === "done" && (
                        <div className="pt-2 animate-in zoom-in duration-200">
                          {renderMockWorkspace()}
                        </div>
                      )}
                    </div>
                    {!isBuddy && (
                      <div className="size-8 rounded-full bg-surface-interactive-weak border border-border-interactive-base/20 text-text-interactive-base shrink-0 flex items-center justify-center font-bold text-xs shadow-xs">
                        {data.preferredName.charAt(0).toUpperCase() || "U"}
                      </div>
                    )}
                  </div>
                )
              })}
              <div ref={chatBottomRef} />
            </div>

            {/* Input Bar */}
            <div className="p-4 border-t border-border-weaker-base bg-background-base shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (activeForm === "name" || activeForm === "personalization") {
                    handleChatSubmit()
                  }
                }}
                className="flex gap-2 items-center"
              >
                <Input
                  disabled={activeForm !== "name" && activeForm !== "personalization"}
                  value={chatInputText}
                  placeholder={
                    activeForm === "name"
                      ? "Type your name..."
                      : activeForm === "personalization"
                        ? "Tell Buddy about your study goals..."
                        : "Select option from the chat bubbles"
                  }
                  onChange={(e) => setChatInputText(e.target.value)}
                  className="flex-1 h-10 text-xs rounded-xl bg-surface-base"
                />
                <Button
                  disabled={
                    (activeForm !== "name" && activeForm !== "personalization") ||
                    !chatInputText.trim()
                  }
                  type="submit"
                  className="h-10 px-4 rounded-xl text-xs font-bold"
                >
                  Send
                </Button>
              </form>
            </div>
          </div>
        </div>

        <FloatingNotes
          title="Option 3: Chat Simulator"
          isNotesOpen={isNotesOpen}
          setIsNotesOpen={setIsNotesOpen}
          bullets={[
            "Highly interactive chat onboarding.",
            "Answers inputs directly into the chat.",
            "Simulates the core OAuth window flow for ChatGPT Plus.",
          ]}
        />
      </div>
    )
  }

  // --- Concept 4: Split Screen Layout ---
  const renderSplitScreen = () => {
    return (
      <div className="relative flex flex-col h-full w-full bg-surface-inset-base p-8 items-center justify-center min-h-0 font-sans">
        {/* Simulated OAuth Modal */}
        {isOAuthBusy && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background-base/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-border-base bg-surface-base p-8 text-center shadow-lg">
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border-success-base/30 bg-surface-success-weak">
                <OpenAIIcon className="size-6 text-icon-success-base" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-text-strong">
                Browser Authentication
              </h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-text-weak">
                Sign in to ChatGPT Plus...
              </p>
              <div className="mt-8 flex items-center justify-center gap-3 rounded-full border border-border-success-base/30 bg-surface-success-weak px-4 py-2 text-xs font-semibold text-text-on-success-weak">
                <PulsingRing />
                Waiting on callback
              </div>
            </div>
          </div>
        )}

        <div className="w-full h-full max-w-4xl bg-background-base rounded-2xl border border-border-base shadow-2xl overflow-hidden flex">
          {/* Left panel graphic */}
          <div className="w-[38%] bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 border-r border-border-base p-8 flex flex-col justify-between shrink-0 text-text-on-interactive-base relative overflow-hidden">
            {/* Soft decorative backlights */}
            <div className="absolute size-48 bg-surface-interactive-base/20 rounded-full blur-3xl -top-10 -left-10" />
            <div className="absolute size-48 bg-surface-interactive-base/15 rounded-full blur-3xl -bottom-10 -right-10" />

            <div className="flex gap-1.5 z-10">
              <span className="size-3 rounded-full bg-surface-critical-base" />
              <span className="size-3 rounded-full bg-surface-warning-base" />
              <span className="size-3 rounded-full bg-surface-success-base" />
            </div>

            <div className="flex flex-col items-center justify-center my-auto space-y-6 z-10">
              {splitStep === 0 && (
                <img
                  src={buddyMascotWaveUrl}
                  alt="Wave"
                  className="w-32 h-32 object-contain animate-bounce"
                />
              )}
              {splitStep === 1 && (
                <img src={buddyMascotPeekUrl} alt="Peek" className="w-32 h-32 object-contain" />
              )}
              {splitStep >= 2 && (
                <img
                  src={buddyMascotApproveUrl}
                  alt="Approve"
                  className="w-32 h-32 object-contain"
                />
              )}

              <div className="text-center space-y-1">
                <h4 className="font-extrabold text-sm tracking-wide uppercase text-text-on-interactive-base/80">
                  Buddy Onboarding
                </h4>
                <p className="text-[10px] text-text-on-interactive-base/60">
                  {splitStep === 0 && "Step 1: Welcome"}
                  {splitStep === 1 && "Step 2: AI Engine"}
                  {splitStep === 2 && "Step 3: Directory"}
                  {splitStep === 3 && "Step 4: Personalize"}
                  {splitStep === 4 && "Workspace Ready"}
                </p>
              </div>
            </div>

            <div className="text-[10px] text-text-on-interactive-base/40 z-10">
              Local-first learning partner.
            </div>
          </div>

          {/* Right panel interactive form */}
          <div className="flex-1 flex flex-col justify-between p-10 min-h-0 overflow-y-auto">
            {splitStep === 0 && (
              <div className="my-auto space-y-5 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <h3 className="text-xl font-extrabold text-text-strong">What is your name?</h3>
                  <p className="text-xs text-text-weak">
                    Set your preferred user identity for Buddy.
                  </p>
                </div>
                <Input
                  value={data.preferredName}
                  placeholder="Preferred Name"
                  onChange={(e) => setData((prev) => ({ ...prev, preferredName: e.target.value }))}
                  className="h-10 text-xs bg-surface-base"
                />
                <Button
                  disabled={!data.preferredName.trim()}
                  onClick={() => setSplitStep(1)}
                  className="rounded-xl px-6 font-semibold"
                >
                  Get Started <ArrowRight className="size-4 ml-1.5" />
                </Button>
              </div>
            )}

            {splitStep === 1 && (
              <div className="my-auto space-y-5 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <h3 className="text-xl font-extrabold text-text-strong">Choose AI Engine</h3>
                  <p className="text-xs text-text-weak">
                    Process queries using ChatGPT Plus or Free built-in models.
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      triggerSimulatedOAuth(() => {
                        setData((prev) => ({ ...prev, authChoice: "chatgpt_plus" }))
                        setSplitStep(2)
                      })
                    }}
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl border font-bold text-xs cursor-pointer transition-all",
                      data.authChoice === "chatgpt_plus"
                        ? "bg-surface-success-weak border-border-success-base text-text-strong"
                        : "bg-surface-base border-border-base hover:bg-surface-raised-base",
                    )}
                  >
                    ChatGPT Plus
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setData((prev) => ({ ...prev, authChoice: "free_models" }))
                      setSplitStep(2)
                    }}
                    className={cn(
                      "flex-1 py-3 px-4 rounded-xl border font-bold text-xs cursor-pointer transition-all",
                      data.authChoice === "free_models"
                        ? "bg-surface-interactive-weak border-border-interactive-base text-text-strong"
                        : "bg-surface-base border-border-base hover:bg-surface-raised-base",
                    )}
                  >
                    Free models
                  </button>
                </div>
                <div className="flex justify-between items-center pt-4">
                  <Button variant="ghost" onClick={() => setSplitStep(0)}>
                    <ArrowLeft className="size-4 mr-1.5" /> Back
                  </Button>
                  <Button disabled={!data.authChoice} onClick={() => setSplitStep(2)}>
                    Continue <ArrowRight className="size-4 ml-1.5" />
                  </Button>
                </div>
              </div>
            )}

            {splitStep === 2 && (
              <div className="my-auto space-y-5 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <h3 className="text-xl font-extrabold text-text-strong">Workspace Directory</h3>
                  <p className="text-xs text-text-weak">Set your notebook database home path.</p>
                </div>

                <div className="p-4 rounded-xl border border-border-base bg-surface-raised-base flex items-center justify-between text-xs">
                  <span className="truncate text-text-weak">{data.storageFolder}</span>
                  <button
                    type="button"
                    onClick={() => setIsFolderPickerOpen(true)}
                    className="font-bold text-text-interactive-base hover:underline cursor-pointer"
                  >
                    Change folder
                  </button>
                </div>

                <div className="flex justify-between items-center pt-4">
                  <Button variant="ghost" onClick={() => setSplitStep(1)}>
                    <ArrowLeft className="size-4 mr-1.5" /> Back
                  </Button>
                  <Button onClick={() => setSplitStep(3)}>
                    Use Default Path <ArrowRight className="size-4 ml-1.5" />
                  </Button>
                </div>
              </div>
            )}

            {splitStep === 3 && (
              <div className="my-auto space-y-4 animate-in fade-in duration-200">
                <div className="space-y-1.5">
                  <h3 className="text-xl font-extrabold text-text-strong">Personalize profile</h3>
                  <p className="text-xs text-text-weak">
                    Provide your occupation and context goals.
                  </p>
                </div>
                <div className="space-y-3">
                  <Input
                    value={data.occupation}
                    placeholder="Occupation (e.g. Scholar, Student)"
                    onChange={(e) => setData((prev) => ({ ...prev, occupation: e.target.value }))}
                    className="h-9 text-xs bg-surface-base"
                  />
                  <Textarea
                    value={data.moreAboutYou}
                    placeholder="Goals and study context details..."
                    onChange={(e) => setData((prev) => ({ ...prev, moreAboutYou: e.target.value }))}
                    className="text-xs bg-surface-base"
                    rows={3}
                  />
                </div>
                <div className="flex justify-between items-center pt-4">
                  <Button variant="ghost" onClick={() => setSplitStep(2)}>
                    <ArrowLeft className="size-4 mr-1.5" /> Back
                  </Button>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setSplitStep(4)}>
                      Skip
                    </Button>
                    <Button onClick={() => setSplitStep(4)}>
                      Complete <ArrowRight className="size-4 ml-1.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {splitStep === 4 && renderMockWorkspace()}
          </div>
        </div>

        <FloatingNotes
          title="Option 4: Split Screen"
          isNotesOpen={isNotesOpen}
          setIsNotesOpen={setIsNotesOpen}
          bullets={[
            "Brand panel stays left, functional forms stay right.",
            "Includes browser connection loading transitions.",
            "Perfect for clean, uncluttered onboarding designs.",
          ]}
        />
      </div>
    )
  }

  // --- Concept 5: Minimalist HUD ---
  const renderHUD = () => {
    return (
      <div className="relative flex flex-col h-full w-full bg-slate-950 items-center justify-center p-8 text-text-strong font-sans">
        {/* Simulated OAuth Modal */}
        {isOAuthBusy && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-background-base/80 backdrop-blur-md animate-in fade-in duration-200">
            <div className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-border-base bg-surface-base p-8 text-center shadow-lg">
              <div className="mb-6 flex size-14 items-center justify-center rounded-2xl border border-border-success-base/30 bg-surface-success-weak">
                <OpenAIIcon className="size-6 text-icon-success-base" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-text-strong">Authentication</h3>
              <p className="mt-2 text-sm font-medium leading-relaxed text-text-weak">
                Connecting browser cluster...
              </p>
              <div className="mt-8 flex items-center justify-center gap-3 rounded-full border border-border-success-base/30 bg-surface-success-weak px-4 py-2 text-xs font-semibold text-text-on-success-weak">
                <PulsingRing />
                OAuth Response Pending
              </div>
            </div>
          </div>
        )}

        <div className="w-full max-w-sm bg-background-base/80 backdrop-blur-xl border border-border-base rounded-2xl p-6 shadow-2xl space-y-5 relative animate-in zoom-in-95 duration-200">
          <div className="flex items-center justify-between border-b border-border-weaker-base pb-2">
            <div className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-surface-interactive-base animate-pulse" />
              <span className="text-[10px] font-bold tracking-wider uppercase text-text-weaker">
                BUDDY HUD SETUP
              </span>
            </div>
            <Badge variant="outline" className="text-[9px] h-4.5 font-bold">
              Step {hudStep + 1} of 4
            </Badge>
          </div>

          {hudStep === 0 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-text-strong">User Identity</h4>
                <p className="text-[11px] text-text-weak">Set your preferred user profile name.</p>
              </div>
              <Input
                value={data.preferredName}
                placeholder="Preferred Name"
                onChange={(e) => setData((prev) => ({ ...prev, preferredName: e.target.value }))}
                className="h-9 text-xs bg-surface-base"
              />
              <Button
                disabled={!data.preferredName.trim()}
                onClick={() => setHudStep(1)}
                className="w-full h-9 text-xs rounded-xl font-bold"
              >
                Continue
              </Button>
            </div>
          )}

          {hudStep === 1 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-text-strong">AI Connection Core</h4>
                <p className="text-[11px] text-text-weak">
                  Supply API clusters for direct inference calls.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => {
                    triggerSimulatedOAuth(() => {
                      setData((prev) => ({ ...prev, authChoice: "chatgpt_plus" }))
                      setHudStep(2)
                    })
                  }}
                  className={cn(
                    "w-full py-2 px-3 rounded-lg border text-left text-xs font-bold transition-all cursor-pointer",
                    data.authChoice === "chatgpt_plus"
                      ? "bg-surface-success-weak border-border-success-base text-text-strong"
                      : "bg-surface-base border-border-weaker-base text-text-weak hover:bg-surface-raised-base",
                  )}
                >
                  ChatGPT Plus
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setData((prev) => ({ ...prev, authChoice: "free_models" }))
                    setHudStep(2)
                  }}
                  className={cn(
                    "w-full py-2 px-3 rounded-lg border text-left text-xs font-bold transition-all cursor-pointer",
                    data.authChoice === "free_models"
                      ? "bg-surface-interactive-weak border-border-interactive-base text-text-strong"
                      : "bg-surface-base border-border-weaker-base text-text-weak hover:bg-surface-raised-base",
                  )}
                >
                  Free built-in models
                </button>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setHudStep(0)}
                  className="w-20 h-9 text-xs rounded-xl"
                >
                  Back
                </Button>
              </div>
            </div>
          )}

          {hudStep === 2 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-text-strong">Notebook Folder Path</h4>
                <p className="text-[11px] text-text-weak">
                  Set your workspace documents destination.
                </p>
              </div>

              <div className="p-2.5 rounded-lg border border-border-weaker-base bg-surface-base text-xs truncate">
                {data.storageFolder}
              </div>

              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setHudStep(1)}
                  className="w-20 h-9 text-xs rounded-xl"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setHudStep(3)}
                  className="flex-1 h-9 text-xs rounded-xl font-bold"
                >
                  Use Default Path
                </Button>
              </div>
            </div>
          )}

          {hudStep === 3 && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="space-y-1">
                <h4 className="font-extrabold text-sm text-text-strong">Personalize Profile</h4>
                <p className="text-[11px] text-text-weak">Set occupation goals.</p>
              </div>
              <div className="space-y-2">
                <Input
                  value={data.occupation}
                  placeholder="Occupation"
                  onChange={(e) => setData((prev) => ({ ...prev, occupation: e.target.value }))}
                  className="h-9 text-xs bg-surface-base"
                />
                <Textarea
                  value={data.moreAboutYou}
                  placeholder="Goals Context..."
                  onChange={(e) => setData((prev) => ({ ...prev, moreAboutYou: e.target.value }))}
                  className="text-xs bg-surface-base"
                  rows={2}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setHudStep(2)}
                  className="w-20 h-9 text-xs rounded-xl"
                >
                  Back
                </Button>
                <Button
                  onClick={() => setHudStep(4)}
                  className="flex-1 h-9 text-xs rounded-xl font-bold"
                >
                  Finish
                </Button>
              </div>
            </div>
          )}

          {hudStep === 4 && renderMockWorkspace()}
        </div>

        <FloatingNotes
          title="Option 5: Minimalist HUD"
          isNotesOpen={isNotesOpen}
          setIsNotesOpen={setIsNotesOpen}
          bullets={[
            "Floating glassmorphic hud layout.",
            "Includes OAuth connector simulations.",
            "Fitted with correct personalization and workspace directories.",
          ]}
        />
      </div>
    )
  }

  // --- RENDER MOCK WORKSPACE PAYOFF ---
  const renderMockWorkspace = () => {
    return (
      <div className="w-full h-full flex min-h-0 bg-background-base rounded-xl border border-border-base overflow-hidden animate-in fade-in duration-500 font-sans">
        {/* Workspace sidebar */}
        <div className="w-52 border-r border-border-weaker-base bg-surface-base p-4 flex flex-col justify-between shrink-0 text-xs">
          <div className="space-y-4">
            <div className="font-bold text-[10px] text-text-weaker uppercase tracking-wider">
              Workspace files
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 p-2 rounded-md bg-surface-raised-base font-semibold text-text-strong">
                <MessageSquare className="size-4 text-text-interactive-base" /> Chat with Buddy
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md hover:bg-surface-raised-base/50 text-text-weak cursor-pointer">
                <FileText className="size-4" /> AGENTS.md
              </div>
              <div className="flex items-center gap-2 p-2 rounded-md hover:bg-surface-raised-base/50 text-text-weak cursor-pointer">
                <BookOpen className="size-4" /> local-papers.pdf
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between text-[11px] text-text-weaker border-t border-border-weaker-base pt-3">
            <div className="flex items-center gap-1.5">
              <Settings className="size-3.5" /> Options
            </div>
            <HelpCircle className="size-3.5" />
          </div>
        </div>

        {/* Workspace main feed */}
        <div className="flex-1 flex flex-col justify-between p-8 bg-background-base overflow-y-auto">
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-border-weaker-base pb-3">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full bg-surface-success-base animate-pulse" />
                <span className="text-[10px] uppercase font-bold text-text-weak">
                  Active Workspace
                </span>
              </div>
              <Badge variant="outline" className="text-[10px] h-5 font-bold">
                Concept Payoff
              </Badge>
            </div>

            {/* Buddy Greeting Bubble */}
            <div className="flex items-start gap-4">
              <div className="size-9 rounded-full border border-border-weaker-base bg-surface-raised-base shrink-0 flex items-center justify-center p-1.5 shadow-xs">
                <img
                  src={buddyMascotApproveUrl}
                  alt="Buddy Mascot Celebrate"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="space-y-4 max-w-[75%]">
                <div className="p-4 bg-surface-base border border-border-weaker-base rounded-2xl rounded-tl-none text-sm text-text-strong leading-relaxed space-y-2.5 shadow-sm">
                  <p>
                    Welcome to the workspace,{" "}
                    <strong className="text-text-interactive-base">
                      {data.preferredName || "friend"}
                    </strong>
                    ! 🎉
                  </p>
                  <p>
                    I have set up our active notebook directory under{" "}
                    <strong className="font-semibold text-text-base">{data.storageFolder}</strong>.
                    Your selected engine is{" "}
                    <strong className="font-semibold text-text-base">
                      {data.authChoice === "chatgpt_plus"
                        ? "ChatGPT Plus (Cloud Core)"
                        : "Free models (Local Core)"}
                    </strong>
                    .
                  </p>
                  {data.occupation && (
                    <p>
                      Profile role configured:{" "}
                      <strong className="font-semibold text-text-base">{data.occupation}</strong>.
                    </p>
                  )}
                  {data.moreAboutYou && (
                    <p>
                      Goals & Context:{" "}
                      <strong className="italic text-text-base">"{data.moreAboutYou}"</strong>.
                    </p>
                  )}
                  <p>What should we work on first?</p>
                </div>

                {/* Suggestions */}
                <div className="grid grid-cols-2 gap-3 max-w-sm">
                  <button
                    type="button"
                    onClick={() => alert("Simulation: Open File Import Dialog")}
                    className="p-3 border border-border-weaker-base bg-background-base rounded-xl text-left text-[11px] hover:bg-surface-raised-base transition-all font-semibold flex items-center gap-2 text-text-strong cursor-pointer hover:scale-[1.02] shadow-xs"
                  >
                    <Folder className="size-4 text-text-interactive-base" /> Upload book
                  </button>
                  <button
                    type="button"
                    onClick={() => alert("Simulation: Open New Note Dialog")}
                    className="p-3 border border-border-weaker-base bg-background-base rounded-xl text-left text-[11px] hover:bg-surface-raised-base transition-all font-semibold flex items-center gap-2 text-text-strong cursor-pointer hover:scale-[1.02] shadow-xs"
                  >
                    <FileText className="size-4 text-text-interactive-base" /> Create note
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-start items-center pt-4 border-t border-border-weaker-base bg-background-base mt-8">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetAll()
              }}
            >
              Restart Onboarding
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Render the Design Hub overview
  const renderOverview = () => {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-8 space-y-8 text-text-base bg-gradient-to-b from-background-base via-background-base to-surface-base/30 font-sans">
        <div className="space-y-3 max-w-3xl">
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-6 text-text-interactive-base" />
            <h1 className="text-2xl font-bold text-text-strong tracking-tight">
              Onboarding Interview Design Options
            </h1>
          </div>
          <p className="text-sm text-text-weak leading-relaxed">
            Assuming we are moving forward with the **Interview Onboarding Paradigm**, we designed 5
            distinct visual styles, copy layout ideas, and step pacing concepts. All versions
            include the necessary model connections and directory selections.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl">
          {/* Card Option 1 */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("standard")
              setActiveConcept("standard")
              resetAll()
            }}
            className="flex flex-col p-6 rounded-2xl border border-border-weaker-base bg-surface-base hover:bg-surface-raised-base text-left transition-all hover:scale-[1.02] hover:shadow-md space-y-4 group cursor-pointer"
          >
            <div className="flex justify-between items-start w-full">
              <Badge className="bg-surface-interactive-weak text-text-interactive-base border-border-interactive-base/20 font-bold px-2 py-0.5">
                Option 1
              </Badge>
            </div>
            <div>
              <h3 className="font-bold text-text-strong text-base group-hover:text-text-interactive-base transition-colors">
                💬 Standard Interview
              </h3>
              <p className="text-xs text-text-weak mt-1.5 leading-relaxed">
                Step-by-step interview dialog cards showing changing mascot expressions depending on
                context.
              </p>
            </div>
            <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-semibold text-text-interactive-base">
              Try Standard{" "}
              <ArrowRight className="size-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Card Option 2 */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("scrolling")
              setActiveConcept("scrolling")
              resetAll()
            }}
            className="flex flex-col p-6 rounded-2xl border border-border-weaker-base bg-surface-base hover:bg-surface-raised-base text-left transition-all hover:scale-[1.02] hover:shadow-md space-y-4 group cursor-pointer"
          >
            <div className="flex justify-between items-start w-full">
              <Badge className="bg-surface-interactive-weak text-text-interactive-base border-border-interactive-base/20 font-bold px-2 py-0.5">
                Option 2
              </Badge>
            </div>
            <div>
              <h3 className="font-bold text-text-strong text-base group-hover:text-text-interactive-base transition-colors">
                📜 Continuous Scroll
              </h3>
              <p className="text-xs text-text-weak mt-1.5 leading-relaxed">
                Inline reveals where succeeding questions fade in as you input values. Keeps prior
                context visible.
              </p>
            </div>
            <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-semibold text-text-interactive-base">
              Try Scrolling{" "}
              <ArrowRight className="size-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Card Option 3 */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("chatSim")
              setActiveConcept("chatSim")
              resetAll()
            }}
            className="flex flex-col p-6 rounded-2xl border border-border-weaker-base bg-surface-base hover:bg-surface-raised-base text-left transition-all hover:scale-[1.02] hover:shadow-md space-y-4 group cursor-pointer"
          >
            <div className="flex justify-between items-start w-full">
              <Badge className="bg-surface-interactive-weak text-text-interactive-base border-border-interactive-base/20 font-bold px-2 py-0.5">
                Option 3
              </Badge>
            </div>
            <div>
              <h3 className="font-bold text-text-strong text-base group-hover:text-text-interactive-base transition-colors">
                💬 Chat Simulator
              </h3>
              <p className="text-xs text-text-weak mt-1.5 leading-relaxed">
                Highly conversational. Asks and submits details as if you're talking directly to
                Buddy inside the workspace feed.
              </p>
            </div>
            <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-semibold text-text-interactive-base">
              Try Chat Simulator{" "}
              <ArrowRight className="size-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Card Option 4 */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("splitScreen")
              setActiveConcept("splitScreen")
              resetAll()
            }}
            className="flex flex-col p-6 rounded-2xl border border-border-weaker-base bg-surface-base hover:bg-surface-raised-base text-left transition-all hover:scale-[1.02] hover:shadow-md space-y-4 group cursor-pointer"
          >
            <div className="flex justify-between items-start w-full">
              <Badge className="bg-surface-interactive-weak text-text-interactive-base border-border-interactive-base/20 font-bold px-2 py-0.5">
                Option 4
              </Badge>
            </div>
            <div>
              <h3 className="font-bold text-text-strong text-base group-hover:text-text-interactive-base transition-colors">
                🌓 Split Screen
              </h3>
              <p className="text-xs text-text-weak mt-1.5 leading-relaxed">
                Left panel offloads visual branding and mascot, keeping form inputs clean and
                spacious on the right.
              </p>
            </div>
            <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-semibold text-text-interactive-base">
              Try Split Screen{" "}
              <ArrowRight className="size-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>

          {/* Card Option 5 */}
          <button
            type="button"
            onClick={() => {
              setActiveTab("hud")
              setActiveConcept("hud")
              resetAll()
            }}
            className="flex flex-col p-6 rounded-2xl border border-border-weaker-base bg-surface-base hover:bg-surface-raised-base text-left transition-all hover:scale-[1.02] hover:shadow-md space-y-4 group cursor-pointer"
          >
            <div className="flex justify-between items-start w-full">
              <Badge className="bg-surface-interactive-weak text-text-interactive-base border-border-interactive-base/20 font-bold px-2 py-0.5">
                Option 5
              </Badge>
            </div>
            <div>
              <h3 className="font-bold text-text-strong text-base group-hover:text-text-interactive-base transition-colors">
                🎛️ Minimalist HUD
              </h3>
              <p className="text-xs text-text-weak mt-1.5 leading-relaxed">
                Compact glassmorphic box setup. High contrast, keyboard friendly, designed for
                direct productivity.
              </p>
            </div>
            <div className="mt-auto pt-4 flex items-center gap-1.5 text-xs font-semibold text-text-interactive-base">
              Try HUD{" "}
              <ArrowRight className="size-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full bg-background-base overflow-hidden select-none">
      {/* Top selection bar */}
      <div className="h-12 bg-surface-raised-base border-b border-border-weaker-base px-4 flex items-center justify-between shrink-0 font-sans">
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="bg-surface-interactive-weak text-text-interactive-base border-border-interactive-base/20 text-[10px] uppercase font-bold py-0.5"
          >
            Easel Mockup
          </Badge>
          <span className="text-xs font-semibold text-text-strong">
            Onboarding Interview Paradigms
          </span>
        </div>

        {/* Dropdown Selector for the interview concepts */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={cn(
              "px-3 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer",
              activeTab === "overview"
                ? "bg-surface-base text-text-strong border border-border-weaker-base shadow-sm"
                : "text-text-weak hover:text-text-base hover:bg-surface-base/50",
            )}
          >
            Design Hub
          </button>

          <select
            value={activeConcept}
            onChange={(e) => {
              setActiveTab(e.target.value as OnboardingOption)
              setActiveConcept(e.target.value as InterviewConceptID)
              resetAll()
            }}
            className="h-8 rounded-lg border border-border-base bg-background-base text-xs font-semibold text-text-strong px-3 outline-none focus:border-border-interactive-base cursor-pointer"
          >
            <option value="standard">💬 Option 1: Standard Interview</option>
            <option value="scrolling">📜 Option 2: Scrolling Interview</option>
            <option value="chatSim">💬 Option 3: Chat Simulator</option>
            <option value="splitScreen">🌓 Option 4: Split Screen</option>
            <option value="hud">🎛️ Option 5: Minimalist HUD</option>
          </select>
        </div>
      </div>

      {/* Main Sandbox Area */}
      <div className="flex-1 min-h-0 relative">
        {activeTab === "overview" && renderOverview()}
        {activeTab === "standard" && renderStandard()}
        {activeTab === "scrolling" && renderScrolling()}
        {activeTab === "chatSim" && renderChatSim()}
        {activeTab === "splitScreen" && renderSplitScreen()}
        {activeTab === "hud" && renderHUD()}

        {/* Storage Folder Selector Simulator Modal */}
        {isFolderPickerOpen && (
          <div className="absolute inset-0 bg-background-base/80 backdrop-blur-sm z-[1000] flex items-center justify-center p-4 font-sans">
            <div className="w-full max-w-sm bg-background-base border border-border-base rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
              <div className="p-4 border-b border-border-weaker-base bg-surface-raised-base flex items-center justify-between">
                <span className="text-xs font-bold text-text-strong flex items-center gap-1.5">
                  <Folder className="size-4.5 text-text-interactive-base" /> Select Storage Folder
                </span>
                <button
                  type="button"
                  onClick={() => setIsFolderPickerOpen(false)}
                  className="text-text-weaker hover:text-text-strong text-xs font-semibold"
                >
                  Cancel
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-text-weak uppercase font-semibold">
                    Folder Path
                  </label>
                  <Input
                    value={customFolderInput}
                    onChange={(e) => setCustomFolderInput(e.target.value)}
                    className="h-8 text-xs bg-background-base"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] text-text-weaker uppercase font-semibold">
                    Quick Suggestions
                  </p>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomFolderInput("~/Documents/Buddy")
                        handleFolderSelect("~/Documents/Buddy")
                      }}
                      className="p-2 border border-border-weaker-base bg-surface-base text-left rounded text-xs hover:bg-surface-raised-base transition-all font-medium text-text-strong flex items-center justify-between"
                    >
                      <span>~/Documents/Buddy</span>
                      <Badge variant="outline" className="text-[9px] h-4 py-0">
                        Default
                      </Badge>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomFolderInput("~/Desktop/BuddySpace")
                        handleFolderSelect("~/Desktop/BuddySpace")
                      }}
                      className="p-2 border border-border-weaker-base bg-surface-base text-left rounded text-xs hover:bg-surface-raised-base transition-all font-medium text-text-strong"
                    >
                      ~/Desktop/BuddySpace
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomFolderInput("~/Projects/Learning")
                        handleFolderSelect("~/Projects/Learning")
                      }}
                      className="p-2 border border-border-weaker-base bg-surface-base text-left rounded text-xs hover:bg-surface-raised-base transition-all font-medium text-text-strong"
                    >
                      ~/Projects/Learning
                    </button>
                  </div>
                </div>

                <Button
                  onClick={() => handleFolderSelect(customFolderInput)}
                  className="w-full h-8 text-xs font-semibold"
                >
                  Confirm Folder
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
