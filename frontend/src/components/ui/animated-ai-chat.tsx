"use client";

import { useEffect, useRef, useCallback, useTransition, useState } from "react";
import { cn } from "@/lib/utils";
import {
    Phone,
    ArrowUpIcon,
    Paperclip,
    Command,
    SendIcon,
    XIcon,
    LoaderIcon,
    Sparkles,
    Mic,
    MicOff,
    MapPin,
    UtensilsCrossed,
    Scissors,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import * as React from "react";
import { GooeyText } from "@/components/ui/gooey-text";

// ---------------------------------------------------------------------------
// Web Speech API type shims (not always present in TS DOM lib)
// ---------------------------------------------------------------------------
interface ISpeechRecognitionResult {
  readonly 0: { transcript: string };
}
interface ISpeechRecognitionEvent extends Event {
  readonly results: ISpeechRecognitionResult[];
}
interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type SpeechRecognitionConstructor = new () => ISpeechRecognition;

// ---------------------------------------------------------------------------
// Internal auto-resize textarea (not exported — use @/components/ui/textarea
// elsewhere in the app)
// ---------------------------------------------------------------------------

interface UseAutoResizeTextareaProps {
    minHeight: number;
    maxHeight?: number;
}

function useAutoResizeTextarea({ minHeight, maxHeight }: UseAutoResizeTextareaProps) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const adjustHeight = useCallback(
        (reset?: boolean) => {
            const textarea = textareaRef.current;
            if (!textarea) return;
            if (reset) {
                textarea.style.height = `${minHeight}px`;
                return;
            }
            textarea.style.height = `${minHeight}px`;
            const newHeight = Math.max(
                minHeight,
                Math.min(textarea.scrollHeight, maxHeight ?? Number.POSITIVE_INFINITY)
            );
            textarea.style.height = `${newHeight}px`;
        },
        [minHeight, maxHeight]
    );

    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) textarea.style.height = `${minHeight}px`;
    }, [minHeight]);

    useEffect(() => {
        const handleResize = () => adjustHeight();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [adjustHeight]);

    return { textareaRef, adjustHeight };
}

interface AutoResizeTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    containerClassName?: string;
    showRing?: boolean;
}

const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, AutoResizeTextareaProps>(
    ({ className, containerClassName, showRing = true, ...props }, ref) => {
        const [isFocused, setIsFocused] = React.useState(false);

        return (
            <div className={cn("relative", containerClassName)}>
                <textarea
                    className={cn(
                        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
                        "transition-all duration-200 ease-in-out",
                        "placeholder:text-muted-foreground",
                        "disabled:cursor-not-allowed disabled:opacity-50",
                        showRing ? "focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0" : "",
                        className
                    )}
                    ref={ref}
                    onFocus={() => setIsFocused(true)}
                    onBlur={() => setIsFocused(false)}
                    {...props}
                />
                {showRing && isFocused && (
                    <motion.span
                        className="absolute inset-0 rounded-md pointer-events-none ring-2 ring-offset-0 ring-violet-500/30"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    />
                )}
            </div>
        );
    }
);
AutoResizeTextarea.displayName = "AutoResizeTextarea";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CommandSuggestion {
    icon: React.ReactNode;
    label: string;
    description: string;
    prefix: string;
}

interface AnimatedAIChatProps {
    onSubmit: (value: string) => Promise<void>;
    loading?: boolean;
    locationHint?: string | null;
    onLocationDetected?: (hint: string) => void;
    showHeading?: boolean;
    animatedPlaceholderTexts?: string[];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function AnimatedAIChat({
    onSubmit,
    loading = false,
    locationHint,
    onLocationDetected,
    showHeading = true,
    animatedPlaceholderTexts,
}: AnimatedAIChatProps) {
    const [value, setValue] = useState("");
    const [attachments, setAttachments] = useState<string[]>([]);
    const [isTyping, setIsTyping] = useState(false);
    const [, startTransition] = useTransition();
    const [activeSuggestion, setActiveSuggestion] = useState<number>(-1);
    const [showCommandPalette, setShowCommandPalette] = useState(false);
    const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
    const [inputFocused, setInputFocused] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef<ISpeechRecognition | null>(null);

    const { textareaRef, adjustHeight } = useAutoResizeTextarea({
        minHeight: 60,
        maxHeight: 200,
    });
    const commandPaletteRef = useRef<HTMLDivElement>(null);

    const showGooey = !!(animatedPlaceholderTexts?.length && !value && !inputFocused);

    // Chatter AI-specific suggestions mapped to the app's use cases
    const commandSuggestions: CommandSuggestion[] = [
        {
            icon: <UtensilsCrossed className="w-4 h-4" />,
            label: "Order Food",
            description: "Call a restaurant and place an order",
            prefix: "Call Chipotle on Market St and order a burrito bowl with chicken, black beans, and guac for pickup in 30 min",
        },
        {
            icon: <Scissors className="w-4 h-4" />,
            label: "Book Appointment",
            description: "Schedule a haircut or service",
            prefix: "Book me a haircut at the nearest Great Clips for tomorrow afternoon",
        },
        {
            icon: <Phone className="w-4 h-4" />,
            label: "Customer Service",
            description: "Handle support calls on your behalf",
            prefix: "Call Comcast support and ask about cancelling my subscription — I want to negotiate a better rate",
        },
    ];

    // Mic support detection — set after mount to avoid SSR hydration mismatch
    const [micSupported, setMicSupported] = useState(false);
    useEffect(() => {
        setMicSupported(
            !!(window as Window & { SpeechRecognition?: unknown }).SpeechRecognition ||
            !!(window as Window & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition
        );
    }, []);

    const toggleMic = useCallback(() => {
        if (typeof window === "undefined") return;
        const SR: SpeechRecognitionConstructor | undefined =
            (window as Window & { SpeechRecognition?: SpeechRecognitionConstructor }).SpeechRecognition ||
            (window as Window & { webkitSpeechRecognition?: SpeechRecognitionConstructor }).webkitSpeechRecognition;
        if (!SR) return;

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.onresult = (e: ISpeechRecognitionEvent) => {
            const transcript = Array.from(e.results)
                .map((r) => r[0].transcript)
                .join("");
            setValue(transcript);
            adjustHeight();
        };
        rec.onend = () => setIsListening(false);
        rec.onerror = () => setIsListening(false);
        rec.start();
        recognitionRef.current = rec;
        setIsListening(true);
    }, [isListening, adjustHeight]);

    // Stop recognition on unmount to prevent state updates on dead component
    useEffect(() => {
        return () => {
            recognitionRef.current?.stop();
            recognitionRef.current = null;
        };
    }, []);

    const handleDetectLocation = useCallback(() => {
        if (!navigator.geolocation || !onLocationDetected) return;
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                onLocationDetected(
                    `${pos.coords.latitude.toFixed(4)},${pos.coords.longitude.toFixed(4)}`
                );
            },
            (err) => console.warn("Location denied:", err)
        );
    }, [onLocationDetected]);

    useEffect(() => {
        if (value.startsWith("/") && !value.includes(" ")) {
            setShowCommandPalette(true);
            const idx = commandSuggestions.findIndex((cmd) =>
                cmd.prefix.toLowerCase().startsWith(value.slice(1).toLowerCase())
            );
            setActiveSuggestion(idx >= 0 ? idx : -1);
        } else {
            setShowCommandPalette(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) =>
            setMousePosition({ x: e.clientX, y: e.clientY });
        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            const commandButton = document.querySelector("[data-command-button]");
            if (
                commandPaletteRef.current &&
                !commandPaletteRef.current.contains(target) &&
                !commandButton?.contains(target)
            ) {
                setShowCommandPalette(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // Sync external loading state with internal isTyping
    useEffect(() => {
        setIsTyping(loading);
    }, [loading]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (showCommandPalette) {
            if (e.key === "ArrowDown") {
                e.preventDefault();
                setActiveSuggestion((prev) =>
                    prev < commandSuggestions.length - 1 ? prev + 1 : 0
                );
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActiveSuggestion((prev) =>
                    prev > 0 ? prev - 1 : commandSuggestions.length - 1
                );
            } else if (e.key === "Tab" || e.key === "Enter") {
                e.preventDefault();
                if (activeSuggestion >= 0) {
                    selectCommandSuggestion(activeSuggestion);
                }
            } else if (e.key === "Escape") {
                e.preventDefault();
                setShowCommandPalette(false);
            }
        } else if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (value.trim() && !isTyping) {
                handleSendMessage();
            }
        }
    };

    const handleSendMessage = () => {
        if (!value.trim() || isTyping) return;
        const msg = value.trim();
        startTransition(() => {
            setIsTyping(true);
            onSubmit(msg)
                .catch((err: unknown) => {
                    console.error("AnimatedAIChat submit error:", err);
                })
                .finally(() => {
                    setIsTyping(false);
                    setValue("");
                    adjustHeight(true);
                });
        });
    };

    const handleAttachFile = () => {
        const mockFileName = `file-${Math.floor(Math.random() * 1000)}.pdf`;
        setAttachments((prev) => [...prev, mockFileName]);
    };

    const removeAttachment = (index: number) => {
        setAttachments((prev) => prev.filter((_, i) => i !== index));
    };

    const selectCommandSuggestion = (index: number) => {
        const selected = commandSuggestions[index];
        setValue(selected.prefix);
        setShowCommandPalette(false);
        adjustHeight();
    };

    return (
        <div className="flex flex-col w-full items-center justify-center bg-transparent text-white p-6 relative overflow-hidden">
            {/* Ambient gradient blobs */}
            <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-yellow-500/8 rounded-full mix-blend-normal filter blur-[128px] animate-pulse" />
                <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-amber-500/6 rounded-full mix-blend-normal filter blur-[128px] animate-pulse delay-700" />
            </div>

            <div className="w-full max-w-2xl mx-auto relative">
                <motion.div
                    className="relative z-10 space-y-10"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                >
                    {/* Heading */}
                    {showHeading && (
                    <div className="text-center space-y-3">
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            className="inline-block"
                        >
                            <h1 className="text-3xl font-medium tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white/90 to-white/40 pb-1">
                                What should the AI do?
                            </h1>
                            <motion.div
                                className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
                                initial={{ width: 0, opacity: 0 }}
                                animate={{ width: "100%", opacity: 1 }}
                                transition={{ delay: 0.5, duration: 0.8 }}
                            />
                        </motion.div>
                        <motion.p
                            className="text-sm text-white/40"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.3 }}
                        >
                            Describe the call in plain English — or speak it
                        </motion.p>
                    </div>
                    )}

                    {/* Input card */}
                    <motion.div
                        className="relative bg-card rounded-xl border border-border/60 shadow-2xl"
                        initial={{ scale: 0.98 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.1 }}
                    >
                        {/* Command palette */}
                        <AnimatePresence>
                            {showCommandPalette && (
                                <motion.div
                                    ref={commandPaletteRef}
                                    className="absolute left-4 right-4 bottom-full mb-2 backdrop-blur-xl bg-black/90 rounded-lg z-50 shadow-lg border border-white/10 overflow-hidden"
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 5 }}
                                    transition={{ duration: 0.15 }}
                                >
                                    <div className="py-1 bg-black/95">
                                        {commandSuggestions.map((suggestion, index) => (
                                            <motion.div
                                                key={suggestion.label}
                                                className={cn(
                                                    "flex items-center gap-2 px-3 py-2 text-xs transition-colors cursor-pointer",
                                                    activeSuggestion === index
                                                        ? "bg-white/10 text-white"
                                                        : "text-white/70 hover:bg-white/5"
                                                )}
                                                onClick={() => selectCommandSuggestion(index)}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                transition={{ delay: index * 0.03 }}
                                            >
                                                <div className="w-5 h-5 flex items-center justify-center text-white/60">
                                                    {suggestion.icon}
                                                </div>
                                                <div className="font-medium">{suggestion.label}</div>
                                                <div className="text-white/40 text-xs ml-1 truncate">
                                                    {suggestion.description}
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Textarea */}
                        <div className="p-4 relative">
                            {showGooey && animatedPlaceholderTexts && (
                                <div
                                    className="absolute left-4 top-4 right-4 pointer-events-none z-10"
                                    style={{ height: 66 }}
                                >
                                    <GooeyText
                                        texts={animatedPlaceholderTexts}
                                        morphTime={1.0}
                                        cooldownTime={2.0}
                                        useFilter={false}
                                        className="w-full h-full"
                                        textClassName="text-sm text-white/40 pt-3 pl-0"
                                    />
                                </div>
                            )}
                            <AutoResizeTextarea
                                ref={textareaRef}
                                value={value}
                                onChange={(e) => {
                                    setValue(e.target.value);
                                    adjustHeight();
                                }}
                                onKeyDown={handleKeyDown}
                                onFocus={() => setInputFocused(true)}
                                onBlur={() => setInputFocused(false)}
                                placeholder={animatedPlaceholderTexts ? "" : "e.g. Call the nearest Starbucks and ask for their holiday hours…"}
                                containerClassName="w-full"
                                className={cn(
                                    "w-full px-4 py-3",
                                    "resize-none",
                                    "bg-transparent",
                                    "border-none",
                                    "text-white/90 text-sm",
                                    "focus:outline-none",
                                    "placeholder:text-white/20",
                                    "min-h-[60px]"
                                )}
                                style={{ overflow: "hidden" }}
                                showRing={false}
                                disabled={isTyping}
                            />
                        </div>

                        {/* Attachments */}
                        <AnimatePresence>
                            {attachments.length > 0 && (
                                <motion.div
                                    className="px-4 pb-3 flex gap-2 flex-wrap"
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: "auto" }}
                                    exit={{ opacity: 0, height: 0 }}
                                >
                                    {attachments.map((file, index) => (
                                        <motion.div
                                            key={index}
                                            className="flex items-center gap-2 text-xs bg-white/[0.03] py-1.5 px-3 rounded-lg text-white/70"
                                            initial={{ opacity: 0, scale: 0.9 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            exit={{ opacity: 0, scale: 0.9 }}
                                        >
                                            <span>{file}</span>
                                            <button
                                                onClick={() => removeAttachment(index)}
                                                className="text-white/40 hover:text-white transition-colors"
                                            >
                                                <XIcon className="w-3 h-3" />
                                            </button>
                                        </motion.div>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Bottom toolbar */}
                        <div className="p-4 border-t border-white/[0.05] flex items-center justify-between gap-4">
                            <div className="flex items-center gap-1">
                                {/* Attach */}
                                <motion.button
                                    type="button"
                                    onClick={handleAttachFile}
                                    whileTap={{ scale: 0.94 }}
                                    className="p-2 text-white/40 hover:text-white/90 rounded-lg transition-colors relative group"
                                    title="Attach file"
                                >
                                    <Paperclip className="w-4 h-4" />
                                </motion.button>

                                {/* Command palette toggle */}
                                <motion.button
                                    type="button"
                                    data-command-button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowCommandPalette((prev) => !prev);
                                    }}
                                    whileTap={{ scale: 0.94 }}
                                    className={cn(
                                        "p-2 text-white/40 hover:text-white/90 rounded-lg transition-colors relative group",
                                        showCommandPalette && "bg-white/10 text-white/90"
                                    )}
                                    title="Quick commands"
                                >
                                    <Command className="w-4 h-4" />
                                </motion.button>

                                {/* Microphone */}
                                <motion.button
                                    type="button"
                                    onClick={toggleMic}
                                    disabled={!micSupported || isTyping}
                                    whileTap={{ scale: 0.94 }}
                                    className={cn(
                                        "p-2 rounded-lg transition-colors relative group",
                                        isListening
                                            ? "text-red-400 bg-red-500/10 animate-pulse"
                                            : "text-white/40 hover:text-white/90",
                                        (!micSupported || isTyping) && "opacity-30 cursor-not-allowed"
                                    )}
                                    title={
                                        !micSupported
                                            ? "Voice input not supported in this browser"
                                            : isListening
                                            ? "Stop recording"
                                            : "Speak your request"
                                    }
                                >
                                    {isListening ? (
                                        <MicOff className="w-4 h-4" />
                                    ) : (
                                        <Mic className="w-4 h-4" />
                                    )}
                                </motion.button>

                                {/* Location */}
                                {onLocationDetected && (
                                    <motion.button
                                        type="button"
                                        onClick={handleDetectLocation}
                                        whileTap={{ scale: 0.94 }}
                                        className={cn(
                                            "p-2 rounded-lg transition-colors relative group",
                                            locationHint
                                                ? "text-emerald-400 bg-emerald-500/10"
                                                : "text-white/40 hover:text-white/90"
                                        )}
                                        title={
                                            locationHint
                                                ? "Location captured — click to refresh"
                                                : "Use my location for nearby searches"
                                        }
                                    >
                                        <MapPin className="w-4 h-4" />
                                    </motion.button>
                                )}
                            </div>

                            {/* Send */}
                            <motion.button
                                type="button"
                                onClick={handleSendMessage}
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                disabled={isTyping || !value.trim()}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    "flex items-center gap-2",
                                    value.trim() && !isTyping
                                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                        : "bg-white/[0.05] text-white/40 cursor-not-allowed"
                                )}
                            >
                                {isTyping ? (
                                    <LoaderIcon className="w-4 h-4 animate-[spin_2s_linear_infinite]" />
                                ) : (
                                    <SendIcon className="w-4 h-4" />
                                )}
                                <span>{isTyping ? "Starting…" : "Start Call"}</span>
                            </motion.button>
                        </div>
                    </motion.div>

                    {/* Quick-fill suggestion chips */}
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        {commandSuggestions.map((suggestion, index) => (
                            <motion.button
                                key={suggestion.label}
                                onClick={() => selectCommandSuggestion(index)}
                                className="flex items-center gap-2 px-3 py-2 bg-white/[0.02] hover:bg-white/[0.05] rounded-lg text-sm text-white/60 hover:text-white/90 transition-all relative group"
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                            >
                                {suggestion.icon}
                                <span>{suggestion.label}</span>
                                <motion.div
                                    className="absolute inset-0 border border-white/[0.05] rounded-lg"
                                    initial={false}
                                    animate={{ opacity: [0, 1], scale: [0.98, 1] }}
                                    transition={{ duration: 0.3, ease: "easeOut" }}
                                />
                            </motion.button>
                        ))}
                    </div>
                </motion.div>
            </div>

            {/* Thinking indicator */}
            <AnimatePresence>
                {isTyping && (
                    <motion.div
                        className="fixed bottom-8 left-1/2 -translate-x-1/2 backdrop-blur-2xl bg-white/[0.02] rounded-full px-4 py-2 shadow-lg border border-white/[0.05]"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-7 rounded-full bg-white/[0.05] flex items-center justify-center">
                                <span className="text-xs font-medium text-white/90">AI</span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-white/70">
                                <span>Starting call</span>
                                <TypingDots />
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Cursor glow when focused */}
            {inputFocused && (
                <motion.div
                    className="fixed w-[50rem] h-[50rem] rounded-full pointer-events-none z-0 opacity-[0.02] bg-gradient-to-r from-violet-500 via-fuchsia-500 to-indigo-500 blur-[96px]"
                    animate={{ x: mousePosition.x - 400, y: mousePosition.y - 400 }}
                    transition={{ type: "spring", damping: 25, stiffness: 150, mass: 0.5 }}
                />
            )}
        </div>
    );
}

function TypingDots() {
    return (
        <div className="flex items-center ml-1">
            {[1, 2, 3].map((dot) => (
                <motion.div
                    key={dot}
                    className="w-1.5 h-1.5 bg-white/90 rounded-full mx-0.5"
                    initial={{ opacity: 0.3 }}
                    animate={{ opacity: [0.3, 0.9, 0.3], scale: [0.85, 1.1, 0.85] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: dot * 0.15, ease: "easeInOut" }}
                    style={{ boxShadow: "0 0 4px rgba(255,255,255,0.3)" }}
                />
            ))}
        </div>
    );
}
