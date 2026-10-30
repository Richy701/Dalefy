import { useSavePerson } from "@/hooks/useSavePerson";
import { combinePeople } from "@/lib/peopleDirectory";
import { OrganizerPersonSelect } from "@/components/workspace/OrganizerPersonSelect";
import { useBulkPeopleImport } from "@/hooks/useBulkPeopleImport";
import { parseTimeInput, formatTimeInput, isValidTimeInput, TIME_INPUT_ERROR } from "@/lib/timeInput";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, arrayMove, useSortable, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ChatCircleText, Megaphone, CaretLeft, Moon, Sun, MapTrifold as MapIcon, SpinnerGap, Plus, AirplaneTilt, Bed, Compass, ForkKnife, Car, Camera, CalendarDots, Users, MapPin, ArrowsClockwise, MagicWand, MagnifyingGlass, X, Upload, CaretRight, Video, Image as ImageIcon2, Trash, Pencil, PaperPlaneTilt, ShareNetwork, Check, FileText, Paperclip, Tag, Phone, Envelope, CaretDown, Eye, EyeSlash, EnvelopeOpen, DotsThreeVertical, DotsSixVertical, ListChecks, DeviceMobileCamera, Train, Bus, Boat, Anchor, UserPlus, DeviceMobile, LinkSimple, Archive, ArrowCounterClockwise, Wallet, ClockCounterClockwise, ImageSquare, LockSimple, UsersThree,
} from "@phosphor-icons/react";
import { lifecycleLabel } from "@/lib/tripLifecycle";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { MobilePreview } from "@/components/workspace/MobilePreview";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { TripHistorySheet } from "@/components/workspace/TripHistorySheet";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { objectPosition } from "@/lib/imagePosition";
import { FocalPointPicker } from "@/components/shared/FocalPointPicker";
import type { TravelEvent, Trip, TripOrganizer, User as UserType } from "@/types";
import { useTrips } from "@/context/TripsContext";
import { useDirectoryTravelers } from "@/context/directory";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useNotifications } from "@/context/NotificationContext";
import { MOCK_USERS } from "@/data/mock-users";
import { SortableEventCard } from "@/components/workspace/SortableEventCard";
import { DaySection } from "@/components/workspace/DaySection";
import { EventPhotosDialog } from "@/components/workspace/EventPhotosDialog";
import { DockBar } from "@/components/workspace/DockBar";
import { TripMap } from "@/components/workspace/TripMap";
import { TaskChecklist } from "@/components/workspace/TaskChecklist";
import { CostSummary } from "@/components/workspace/CostSummary";
import { ItineraryAssistant } from "@/components/workspace/ItineraryAssistant";
import { TripMediaGallery } from "@/components/workspace/TripMediaGallery";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { ShareTripDialog } from "@/components/shared/ShareTripDialog";
import { ItineraryPreviewDialog, ItineraryPreviewContent } from "@/components/shared/ItineraryPreviewDialog";
import { NotificationPanel } from "@/components/shared/NotificationPanel";
import { FlightSearch } from "@/components/workspace/FlightSearch";
import { HotelSearch } from "@/components/workspace/HotelSearch";
import { ActivitySearch } from "@/components/workspace/ActivitySearch";
import { DiningSearch } from "@/components/workspace/DiningSearch";
import { LocationAutocomplete } from "@/components/shared/LocationAutocomplete";
import { searchImages } from "@/services/imageSearch";
import { lookupFlight } from "@/services/serpapi";
import { usePermissions } from "@/hooks/usePermissions";
import { useDemo } from "@/hooks/useDemo";
import { DemoUpgradeDialog } from "@/components/shared/DemoUpgradeDialog";
import { notifyTripUpdate } from "@/services/pushNotify";
import { publishedChanges } from "@/lib/tripChanges";
import { fetchTripMembers, APP_MEMBERS_ERROR, setMemberTraveler, unlinkTraveler, removeUserFromTrip, type TripMember } from "@/services/firebaseTrips";
import { isFirebaseConfigured, firebaseStorage, firebaseAuth } from "@/services/firebase";
import { ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { shrinkImage } from "@/lib/shrinkImage";
import { ImportItineraryDialog } from "@/components/shared/ImportItineraryDialog";
import { BulkAddPeopleDialog } from "@/components/shared/BulkAddPeopleDialog";
import { PersonAvatar } from "@/components/shared/PersonAvatar";
import { tripTravelerOf } from "@/lib/travelerSync";
import { timeAgo } from "@/lib/timeAgo";
import { SendInviteModal } from "@/components/workspace/SendInviteModal";
import { MessageDialog } from "@/components/shared/MessageDialog";
import { withoutTravelers } from "@/lib/removeTravelers";
import { useBrand, hexToRgb } from "@/context/BrandContext";
import { Linkify } from "@/lib/linkify";
import { destinationTz } from "@/lib/timezone";
import { parseTripDate, parseEventDateTime } from "@/lib/dates";
import { tripFactLine, shortDay } from "@/lib/tripSummary";
import { CategoryDot } from "@/components/ui/category-dot";
import { usePresence } from "@/hooks/usePresence";
import { sortEvents, inDayOrder } from "@/lib/sortEvents";
import { IMAGE_BANK, COVER_IMAGES, getEventImageCategory, generateEventImage } from "@/data/images";
// The PDF builder and jsPDF are lazy-loaded in handleExportPdf to keep them off the critical path

// ─────────────────────────────────────────────────────────────────────────────


type EventErrors = Partial<Record<"title" | "date" | "time" | "endTime" | "checkout", string>>;

function validateEvent(ev: TravelEvent): EventErrors {
  const errors: EventErrors = {};
  if (!ev.title?.trim()) errors.title = "Give this event a title";
  if (!ev.date) errors.date = "Pick a date";
  if (!isValidTimeInput(ev.time)) errors.time = TIME_INPUT_ERROR;
  if (!isValidTimeInput(ev.endTime)) errors.endTime = TIME_INPUT_ERROR;
  if (ev.type === "hotel" && ev.checkin && ev.checkout && ev.checkout < ev.checkin) {
    errors.checkout = "Check-out must be after check-in";
  }
  return errors;
}

function SortableItem({ id, children, handleClass }: { id: string; children: React.ReactNode; handleClass?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: React.CSSProperties = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1, zIndex: isDragging ? 50 : undefined, position: "relative" };
  return (
    <div ref={setNodeRef} style={style} className="group/sort">
      {handleClass ? (
        <>
          <div {...attributes} {...listeners} className={handleClass}>
            <DotsSixVertical className="h-3.5 w-3.5" />
          </div>
          {children}
        </>
      ) : (
        <div {...attributes} {...listeners}>{children}</div>
      )}
    </div>
  );
}

export function WorkspacePage() {
  const saveBulkPeople = useBulkPeopleImport();
  const { tripId } = useParams<{ tripId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { trips, ready, updateTrip, saveTrip, updateEvent, deleteEvent, deleteTrip } = useTrips();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { addNotification } = useNotifications();
  const { canDeleteTrip, isOrgMember, isViewer } = usePermissions();
  const { isDemo, demoGate, upgradeOpen, setUpgradeOpen } = useDemo();
  const { brand } = useBrand();
  const { others: presenceUsers, updateActivity } = usePresence(tripId);

  const trip = useMemo(() => trips.find(t => t.id === tripId) || null, [trips, tripId]);
  // What travellers would notice if this were published now: -1 for a trip that's never been published
  const pendingChanges = useMemo(() => {
    if (!trip) return 0;
    const snap = trip.publishedSnapshot;
    if (trip.status !== "Published" || !snap) return -1;
    const itinerary = publishedChanges(snap, { events: trip.events, start: trip.start, end: trip.end, info: trip.info }).length;
    // The organiser card is left out: directory syncs rewrite the published copy's contact fields on their own
    const header = [snap.name !== trip.name, snap.image !== trip.image].filter(Boolean).length;
    return itinerary + header;
  }, [trip]);
  const tripTz = useMemo(() => destinationTz(trip?.destination), [trip?.destination]);

  // Auto-open event from ?event= query param (e.g. from Dashboard event cards)
  useEffect(() => {
    const eventId = searchParams.get("event");
    if (!eventId || !trip) return;
    const ev = trip.events.find(e => e.id === eventId);
    if (ev) {
      setEditingEvent(ev);
      setIsEditPanelOpen(true);
      searchParams.delete("event");
      setSearchParams(searchParams, { replace: true });
    }
  }, [trip, searchParams, setSearchParams]);

  // On-demand flight status check: refresh flights within 48 hours of now
  const flightCheckRan = useRef(false);
  const editingEventIdRef = useRef<string | null>(null);
  const latestTripRef = useRef(trip);
  useEffect(() => { latestTripRef.current = trip; }, [trip]);
  useEffect(() => {
    if (!trip || flightCheckRan.current) return;
    const now = Date.now();
    const H48 = 48 * 60 * 60 * 1000;
    const upcomingFlights = trip.events.filter(ev => {
      if (ev.type !== "flight" || !ev.flightNum || !ev.date) return false;
      const evTime = parseEventDateTime(ev.date, ev.time).getTime();
      return evTime > now - H48 && evTime < now + H48;
    });
    if (upcomingFlights.length === 0) return;
    flightCheckRan.current = true;

    (async () => {
      for (const ev of upcomingFlights) {
        try {
          const results = await lookupFlight(ev.flightNum!, ev.date);
          const match = results[0];
          if (!match) continue;

          const updates: Partial<TravelEvent> = {};
          if (match.status && match.status !== ev.status) updates.status = match.status;
          if (match.terminal && match.terminal !== ev.terminal) updates.terminal = match.terminal;
          if (match.arrTerminal && match.arrTerminal !== ev.arrTerminal) updates.arrTerminal = match.arrTerminal;
          if (match.gate && match.gate !== ev.gate) updates.gate = match.gate;
          if (match.arrGate && match.arrGate !== ev.arrGate) updates.arrGate = match.arrGate;
          if (match.baggageBelt && match.baggageBelt !== ev.baggageBelt) updates.baggageBelt = match.baggageBelt;
          if (match.departTime && match.departTime !== ev.time) updates.time = match.departTime;
          if (match.arriveTime && match.arriveTime !== ev.endTime) updates.endTime = match.arriveTime;
          if (match.aircraft && match.aircraft !== ev.aircraft) updates.aircraft = match.aircraft;
          if (match.depTz && match.depTz !== ev.depTz) updates.depTz = match.depTz;
          if (match.arrTz && match.arrTz !== ev.arrTz) updates.arrTz = match.arrTz;

          if (Object.keys(updates).length > 0) {
            // Never overwrite an event the user is editing right now; merge onto the latest saved copy
            if (editingEventIdRef.current === ev.id) continue;
            const latest = latestTripRef.current?.events.find(e => e.id === ev.id) ?? ev;
            updateEvent(trip.id, { ...latest, ...updates });
            const what = [
              updates.time ? `departs ${updates.time}` : null,
              updates.gate ? `gate ${updates.gate}` : null,
              updates.terminal ? `terminal ${updates.terminal}` : null,
              updates.status ? String(updates.status).toLowerCase() : null,
            ].filter(Boolean).join(", ");
            toast.info(`${ev.flightNum} updated from live flight data${what ? `: ${what}` : ""}`);
          }
        } catch {
          // best-effort, don't block the page
        }
      }
    })();
  }, [trip, updateEvent]);

  const [showMap, setShowMap] = useState(false);
  const [showTasks, setShowTasks] = useState(() => searchParams.get("panel") === "tasks");
  const [showCosts, setShowCosts] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [photosOpen, setPhotosOpen] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  // The phone preview panel is dragged wider or narrower from its left edge; the phone scales to fit
  const [previewWidth, setPreviewWidth] = useState<number | null>(() => {
    try { const v = Number(localStorage.getItem("daf-preview-width")); return v >= 300 ? v : null; } catch { return null; }
  });
  const startPreviewResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    const right = handle.parentElement!.getBoundingClientRect().right;
    handle.setPointerCapture(e.pointerId);
    let latest = 0;
    const move = (ev: PointerEvent) => {
      latest = Math.round(Math.min(Math.max(right - ev.clientX, 300), window.innerWidth * 0.65));
      setPreviewWidth(latest);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      if (latest) { try { localStorage.setItem("daf-preview-width", String(latest)); } catch { /* private mode */ } }
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  }, []);
  const [showAssistant, setShowAssistant] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TravelEvent | null>(null);
  const [eventErrors, setEventErrors] = useState<EventErrors>({});
  useEffect(() => { editingEventIdRef.current = isEditPanelOpen && editingEvent ? editingEvent.id : null; }, [isEditPanelOpen, editingEvent]);
  const editBaseline = useRef<Trip | undefined>(undefined);
  // A save that would empty Information & Documents waits here for a yes
  const [confirmClearInfo, setConfirmClearInfo] = useState<(() => Promise<void>) | null>(null);
  /** What the waiting save would remove, in words: "all 17 Information & Documents cards", "the organiser (Laura Davies)" */
  const [clearing, setClearing] = useState<string[]>([]);
  const saveBusy = useRef(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const editingOriginalRef = useRef<string | null>(null);
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const [imageSeed, setImageSeed] = useState(0);
  const [imageIsAuto, setImageIsAuto] = useState(false);
  const [imageSearch, setImageSearch] = useState("");
  const [imageResults, setImageResults] = useState<string[]>([]);
  const [isSearchingImages, setIsSearchingImages] = useState(false);
  const [imageSearchSource, setImageSearchSource] = useState<"google" | "unsplash" | "pexels" | "local" | null>(null);
  const [imagePage, setImagePage] = useState(1);
  const [imageLastQuery, setImageLastQuery] = useState("");
  const [preferredImageSource, setPreferredImageSource] = useState<"auto" | "google" | "unsplash" | "pexels">("auto");
  const [aiAssistLoading, setAiAssistLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"itinerary" | "media" | "people">("itinerary");
  const savePerson = useSavePerson();
  const [emailSaving, setEmailSaving] = useState(false);
  const [customTravelers, setCustomTravelers] = useDirectoryTravelers();
  const allTravelers = useMemo(() => {
    const seen = new Set<string>();
    if (isDemo) {
      return [...MOCK_USERS, ...customTravelers].filter(u => {
        if (seen.has(u.id)) return false;
        seen.add(u.id);
        return true;
      });
    }
    const fromTrips: UserType[] = [];
    for (const t of trips) {
      if (!t.travelers) continue;
      for (const tv of t.travelers) {
        fromTrips.push({
          id: tv.id,
          name: tv.name,
          email: tv.email || "",
          role: "Traveler",
          avatar: tv.avatar || "",
          initials: tv.initials,
          status: "Active",
        });
      }
    }
    return combinePeople([...fromTrips, ...customTravelers]);
  }, [customTravelers, trips, isDemo]);

  const tripTravelers = useMemo(() => {
    if (!trip) return [];
    const ids = new Set([...(trip.travelerIds || []), ...(trip.travelers || []).map(person => person.id)]);
    return allTravelers.filter(person => ids.has(person.id));
  }, [trip, allTravelers]);
  const availableTravelers = useMemo(() => {
    if (!trip) return allTravelers;
    const linkedIds = new Set(tripTravelers.map(t => t.id));
    return allTravelers.filter(u => !linkedIds.has(u.id));
  }, [trip, allTravelers, tripTravelers]);
  // Who on this trip has joined in the app, and which traveller each one picked
  const [tripMembers, setTripMembers] = useState<TripMember[]>([]);
  const [membersLoadedFor, setMembersLoadedFor] = useState<string | null>(null);
  const [membersReload, setMembersReload] = useState(0);
  const [membersErrorFor, setMembersErrorFor] = useState<string | null>(null);
  useEffect(() => {
    if (!tripId || isDemo || !isFirebaseConfigured()) return;
    let cancelled = false;
    fetchTripMembers([tripId]).then(list => {
      if (cancelled) return;
      setTripMembers(list);
      setMembersLoadedFor(tripId);
      setMembersErrorFor(null);
    }).catch(() => { if (!cancelled) setMembersErrorFor(tripId); });
    return () => { cancelled = true; };
  }, [tripId, isDemo, membersReload]);
  const membersLoaded = !!tripId && membersLoadedFor === tripId;
  const membersHere = useMemo(() => (membersLoaded ? tripMembers.filter(m => m.trip_id === tripId) : []), [membersLoaded, tripMembers, tripId]);
  // Suppliers typed on any trip, so the same hotel or coach company is spelled the same way next time
  const knownSuppliers = useMemo(() => {
    const seen = new Map<string, string>();
    for (const t of trips) for (const e of t.events) { const s = e.supplier?.trim(); if (s && !seen.has(s.toLowerCase())) seen.set(s.toLowerCase(), s); }
    return [...seen.values()].sort((a, b) => a.localeCompare(b));
  }, [trips]);

  const memberByTraveler = useMemo(
    () => new Map(membersHere.filter(m => m.linked_traveler_id).map(m => [m.linked_traveler_id!, m])),
    [membersHere],
  );
  // Joined with "I'm not listed", or picked someone who has since come off the list
  // One row per person: the same account on two phones (or a reinstall) joins twice, and both records
  // must be linked or removed together
  const unlistedMembers = useMemo(() => {
    const unlinked = membersHere.filter(m => !m.linked_traveler_id || !tripTravelers.some(t => t.id === m.linked_traveler_id));
    const byPerson = new Map<string, TripMember & { deviceIds: string[]; keys: string[] }>();
    for (const m of unlinked) {
      const person = m.uid || m.email?.trim().toLowerCase() || m.device_id;
      const row = byPerson.get(person);
      if (row) {
        if (!row.deviceIds.includes(m.device_id)) row.deviceIds.push(m.device_id);
        const key = m.uid || m.device_id;
        if (!row.keys.includes(key)) row.keys.push(key);
        if (m.joined_at > row.joined_at) Object.assign(row, { name: m.name || row.name, email: m.email || row.email, joined_at: m.joined_at });
      } else {
        byPerson.set(person, { ...m, deviceIds: [m.device_id], keys: [m.uid || m.device_id] });
      }
    }
    return [...byPerson.values()];
  }, [membersHere, tripTravelers]);
  const [removeTarget, setRemoveTarget] = useState<{ id: string; name: string } | null>(null);
  const [removeMemberTarget, setRemoveMemberTarget] = useState<{ keys: string[]; name: string } | null>(null);
  const [peopleSearch, setPeopleSearch] = useState("");
  const [editingEmailId, setEditingEmailId] = useState<string | null>(null);
  const [editingEmailValue, setEditingEmailValue] = useState("");
  const [bulkEmailMode, setBulkEmailMode] = useState(false);
  const [bulkEmails, setBulkEmails] = useState<Record<string, string>>({});
  const saveTravelerEmail = async (travelerId: string, email: string) => {
    const original = allTravelers.find(person => person.id === travelerId);
    if (!original) return false;
    setEmailSaving(true);
    try { await savePerson(original, { email: email.trim().toLowerCase() }); return true; }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save email. Please retry.'); return false; }
    finally { setEmailSaving(false); }
  };

  const [viewAsId, setViewAsId] = useState<string | null>(null);
  const viewAsTraveler = useMemo(() => viewAsId ? allTravelers.find(u => u.id === viewAsId) ?? null : null, [viewAsId, allTravelers]);
  const [activeDayIdx, setActiveDayIdx] = useState(0);
  const printRef = useRef<HTMLDivElement>(null);
  const pdfRef = useRef<HTMLDivElement>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editTripOpen, setEditTripOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Partial<Trip>>({});
  const [tripImageSearch, setTripImageSearch] = useState("");
  const [tripImageResults, setTripImageResults] = useState<string[]>([]);
  const [isTripImageSearching, setIsTripImageSearching] = useState(false);
  const [tripImagePage, setTripImagePage] = useState(1);
  const [tripImageLastQuery, setTripImageLastQuery] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [sendInviteOpen, setSendInviteOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [reimportOpen, setReimportOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editOrgOpen, setEditOrgOpen] = useState(false);
  const [editOrgData, setEditOrgData] = useState<Partial<NonNullable<Trip["organizer"]>>>({});
  const [editInfoOpen, setEditInfoOpen] = useState(false);
  const [editInfoData, setEditInfoData] = useState<NonNullable<Trip["info"]>>([]);
  const [expandedInfoIds, setExpandedInfoIds] = useState<Set<string>>(new Set());
  const [tripDocDragOver, setTripDocDragOver] = useState(false);
  const [, setTripDocUploading] = useState(false);
  const [renamingDocId, setRenamingDocId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const tripDocInputRef = useRef<HTMLInputElement>(null);
  const tripDocInputRef2 = useRef<HTMLInputElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !trip) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const activeEvent = trip.events.find(e => e.id === activeId);
    const overEvent = trip.events.find(e => e.id === overId);
    if (!activeEvent || !overEvent) return;

    // Days list by time, so the moved event takes the time (and day) of the one it was dropped on and sits
    // next to it; ties keep the stored order. Only the moved event changes, every other time stays as it was.
    const moved = { ...activeEvent, date: overEvent.date, time: overEvent.time };
    const rest = trip.events.filter(e => e.id !== activeId);
    const overIdx = rest.findIndex(e => e.id === overId);
    const sameDay = activeEvent.date === overEvent.date;
    const shown = inDayOrder(trip.events.filter(e => e.date === activeEvent.date));
    const movingDown = sameDay && shown.findIndex(e => e.id === activeId) < shown.findIndex(e => e.id === overId);
    rest.splice(movingDown ? overIdx + 1 : overIdx, 0, moved);

    updateTrip(trip.id, { events: rest });
    const when = [!sameDay && parseTripDate(overEvent.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }), moved.time !== activeEvent.time && (moved.time || "no time")].filter(Boolean).join(", ");
    toast.success(when ? `Moved ${activeEvent.title || "event"} to ${when}` : "Events reordered");
  }, [trip, updateTrip]);

  const runImageSearch = async (query: string, page = 1, sourceOverride?: "auto" | "google" | "unsplash" | "pexels") => {
    if (!query.trim()) return;
    setIsSearchingImages(true);
    setImageLastQuery(query);
    setImagePage(page);
    try {
      const src = sourceOverride ?? preferredImageSource;
      const srcParam = src === "auto" ? undefined : src;
      const { urls, source } = await searchImages(query, page, 9, srcParam);
      if (urls.length) {
        setImageResults(urls);
        setImageSearchSource(source as "google" | "unsplash" | "pexels" | "local");
        return;
      }
      const cat = getEventImageCategory(query, editingEvent?.type || "activity");
      const bank = IMAGE_BANK[cat] ?? IMAGE_BANK.activity;
      setImageResults([...bank, ...IMAGE_BANK.activity].slice(0, 9));
      setImageSearchSource("local");
    } finally {
      setIsSearchingImages(false);
    }
  };

  // The viewer's own calendar day, in the same YYYY-MM-DD shape as event dates, to mark "Today" in the day list
  const todayIso = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();
  const groupedEvents = useMemo(() => {
    if (!trip) return [];
    let events = trip.events;
    // Filter by "View As" traveler
    if (viewAsId) {
      events = events.filter(
        e => !e.assignedTo || e.assignedTo.length === 0 || e.assignedTo.includes(viewAsId)
      );
    }
    const groups: Record<string, TravelEvent[]> = {};
    // The traveller app's order: timed events by time, untimed ones where the organiser put them
    const sorted = sortEvents(events);
    sorted.forEach(e => { if (!groups[e.date]) groups[e.date] = []; groups[e.date].push(e); });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [trip?.events, viewAsId]);

  // Generate placeholder image when title changes (no API calls)
  useEffect(() => {
    if (!editingEvent || !isEditPanelOpen) return;
    const { title, type } = editingEvent;
    if (title.length < 3 || type === "flight") return;
    if (imageIsAuto) {
      const img = generateEventImage(title, type, imageSeed);
      setEditingEvent(prev => prev ? { ...prev, image: img } : null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEvent?.title, editingEvent?.type, imageSeed, imageIsAuto, isEditPanelOpen]);

  /** Build a Mapbox Static Images URL with route pins for the trip */
  const buildStaticMapUrl = useCallback(async (): Promise<string | null> => {
    const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
    if (!MAPBOX_TOKEN || !trip) return null;
    const { resolveCoords } = await import("@/data/coordinates");
    const { geocode } = await import("@/services/geocode");
    const resolve = async (loc: string): Promise<[number, number] | null> =>
      resolveCoords(loc) ?? (await geocode(loc));

    const coords: [number, number][] = [];
    for (const ev of trip.events.filter(e => e.type === "flight")) {
      const match = ev.location.match(/^(.+?)\s+to\s+(.+)$/);
      if (!match) continue;
      const from = await resolve(match[1].trim());
      const to = await resolve(match[2].trim());
      if (from) coords.push(from);
      if (to) coords.push(to);
    }
    if (coords.length === 0) return null;

    // Mapbox Static Images: pin markers + auto-fit
    const markers = coords
      .map(([lat, lng]) => `pin-s+0bd2b5(${lng},${lat})`)
      .join(",");
    return `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/${markers}/auto/800x300@2x?padding=60&logo=false&attribution=false&access_token=${MAPBOX_TOKEN}`;
  }, [trip]);

  // The command palette's trip actions (Publish, Share, Email itinerary) arrive as a window event.
  // Hooks stay above the early return below, so the hook order never changes between renders.
  const paletteActions = useRef<Record<"publish" | "share" | "email", () => void>>({ publish: () => {}, share: () => {}, email: () => {} });
  useEffect(() => {
    const onAction = (e: Event) => {
      const action = (e as CustomEvent<{ action?: string }>).detail?.action;
      if (action === "publish" || action === "share" || action === "email") paletteActions.current[action]();
    };
    window.addEventListener("dalefy:trip-action", onAction);
    return () => window.removeEventListener("dalefy:trip-action", onAction);
  }, []);

  if (!trip) {
    if (!ready) {
      return (
        <div className="h-screen flex items-center justify-center bg-background">
          <div className="h-10 w-10 rounded-full border-2 border-border border-t-brand animate-spin" />
        </div>
      );
    }
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-xl font-semibold tracking-tight text-foreground">Trip not found</p>
          <Button onClick={() => navigate("/dashboard")} className="bg-primary text-primary-foreground font-bold rounded-xl">Back to Dashboard</Button>
        </div>
      </div>
    );
  }

  // Off the list, off their events, and unlinked from anyone who picked them in the app
  const removeTravelerFromTrip = async (t: { id: string; name: string }) => {
    const { updates, events } = withoutTravelers(trip, new Set([t.id]));
    updateTrip(trip.id, updates);
    events.forEach(ev => updateEvent(trip.id, ev));
    if (memberByTraveler.has(t.id)) {
      await unlinkTraveler(trip.id, t.id).catch(() => toast.error("Removed, but couldn't unlink their app account"));
      setMembersReload(n => n + 1);
    }
    toast.success(`Removed ${t.name} from trip`);
  };

  const handleGeocodeAll = async () => {
    if (geocoding || !trip) return;
    setGeocoding(true);
    try {
      const { geocodeMany, tripArea } = await import("@/services/geocode");
      const withLocation = trip.events.filter(ev => ev.location);
      if (withLocation.length === 0) {
        toast.success("No event locations to geocode");
        setGeocoding(false);
        return;
      }
      // The trip's cities and countries, so lookups stay on the trip (a bare coordinate here broke every lookup)
      const area = await tripArea(trip.destination);
      const coordMap = await geocodeMany(withLocation.map(ev => ev.location), area);
      const updated = trip.events.map(ev => {
        if (ev.location && coordMap[ev.location]) {
          return { ...ev, locationCoords: coordMap[ev.location] };
        }
        return ev;
      });
      const resolved = Object.keys(coordMap).length;
      updateTrip(trip.id, { events: updated });
      toast.success(`Geocoded ${resolved} of ${withLocation.length} locations`);
    } catch {
      toast.error("Geocoding failed");
    }
    setGeocoding(false);
  };

  const commitChanges = async (updates: Partial<Trip>, before?: Trip, opts?: { allowClearInfo?: boolean }) => {
    if (saveBusy.current) return false;
    saveBusy.current = true; setSavingChanges(true);
    const message = toast.loading('Saving changes…');
    try { await saveTrip(trip.id, updates, before, opts); toast.dismiss(message); return true; }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Could not save. Your changes are still here.', { id: message }); return false; }
    finally { saveBusy.current = false; setSavingChanges(false); }
  };

  const handlePublish = async () => {
    if (publishing) return;
    setPublishing(true);
    const snapshot = {
      events: trip.events,
      info: trip.info,
      documents: trip.documents,
      organizer: trip.organizer,
      image: trip.image,
      imagePosition: trip.imagePosition,
      name: trip.name,
      destination: trip.destination,
      start: trip.start,
      end: trip.end,
      paxCount: trip.paxCount,
      travelers: trip.travelers?.map(({ id, name, initials, avatar }) => ({ id, name, initials, ...(avatar ? { avatar } : {}) })),
      publishedAt: new Date().toISOString(),
    };
    const wasPublished = trip.status === "Published";
    // Travellers only see published versions, so publishing is the one moment they hear about changes
    const changes = wasPublished && trip.publishedSnapshot ? publishedChanges(trip.publishedSnapshot, snapshot) : ["Trip published"];
    try {
      await saveTrip(trip.id, { status: "Published", publishedSnapshot: snapshot }, trip);
    } catch {
      setPublishing(false);
      toast.error("Couldn't publish. Check your connection and review the trip before retrying.");
      return;
    }
    setPublishing(false);
    toast.success(wasPublished ? "Changes published" : "Trip published");
    addNotification({ message: wasPublished ? "Changes published" : "Trip published", detail: trip.name, time: "Just now", type: "success" });
    if (changes.length) notifyTripUpdate(trip.id, trip.name, changes);
    setShareOpen(true);
  };

  const handleAddEvent = (type: TravelEvent["type"] = "activity") => {
    if (isViewer) return;
    if (demoGate()) return;
    setImageSeed(0);
    setImageIsAuto(true);
    setImageSearch("");
    setImageResults([]);
    setImageSearchSource(null);
    const activeDate = groupedEvents[activeDayIdx]?.[0] || trip.start || new Date().toISOString().split("T")[0];
    editBaseline.current = trip;
    setEditingEvent({
      id: crypto.randomUUID(),
      type,
      date: activeDate,
      title: "",
      time: "",
      location: "",
      status: "Proposed",
    });
    setEventErrors({});
    editingOriginalRef.current = null; // new event: dirty as soon as anything is typed
    setIsEditPanelOpen(true);
  };

  const handleEditEvent = (event: TravelEvent) => {
    if (isViewer || demoGate()) return;
    setImageSeed(0);
    setImageIsAuto(!event.image);
    setImageSearch("");
    setImageResults([]);
    setImageSearchSource(null);
    editBaseline.current = trip;
    setEditingEvent({ ...event });
    setEventErrors({});
    editingOriginalRef.current = JSON.stringify(event);
    setIsEditPanelOpen(true);
    if (event.date) updateActivity(event.date, event.id);
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demoGate()) return;
    if (!editingEvent) return;
    const errors = validateEvent(editingEvent);
    if (Object.keys(errors).length > 0) {
      setEventErrors(errors);
      toast.error(Object.values(errors)[0]);
      return;
    }
    // Normalise times so sorting and the traveler view get HH:MM
    const normalised: TravelEvent = {
      ...editingEvent,
      title: editingEvent.title.trim(),
      time: editingEvent.time ? formatTimeInput(editingEvent.time) : editingEvent.time,
      endTime: editingEvent.endTime ? formatTimeInput(editingEvent.endTime) : editingEvent.endTime,
    };
    const isNew = !trip.events.some(ev => ev.id === normalised.id);
    const baseline = editBaseline.current || trip;
    const events = baseline.events.some(ev => ev.id === normalised.id) ? baseline.events.map(ev => ev.id === normalised.id ? normalised : ev) : [...baseline.events, normalised];
    if (!await commitChanges({ events }, baseline)) return;
    setEventErrors({});
    editingOriginalRef.current = null;
    setIsEditPanelOpen(false);
    setEditingEvent(null);
    toast.success(isNew ? "Event added" : "Event saved");
  };

  const isEventDirty = () => {
    if (!editingEvent) return false;
    if (editingOriginalRef.current === null) {
      // New event: dirty if the user typed anything meaningful
      return !!(editingEvent.title?.trim() || editingEvent.location?.trim() || editingEvent.description?.trim() || editingEvent.time);
    }
    return JSON.stringify(editingEvent) !== editingOriginalRef.current;
  };

  const handleEventDialogOpenChange = (open: boolean) => {
    if (open) { setIsEditPanelOpen(true); return; }
    if (isEventDirty()) { setDiscardPromptOpen(true); return; }
    setIsEditPanelOpen(false);
    setEventErrors({});
  };

  const discardEventChanges = () => {
    setDiscardPromptOpen(false);
    setIsEditPanelOpen(false);
    setEditingEvent(null);
    setEventErrors({});
    editingOriginalRef.current = null;
  };

  const handleAiAssist = async () => {
    if (!editingEvent || aiAssistLoading) return;
    if (!editingEvent.title && !editingEvent.location) {
      toast.error("Add a title or location first");
      return;
    }
    setAiAssistLoading(true);
    try {
      const idToken = await firebaseAuth().currentUser?.getIdToken().catch(() => null);
      if (!idToken) {
        toast.error("Sign in to use AI assist");
        return;
      }
      const resp = await fetch("/api/parse-itinerary?mode=assist", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          type: editingEvent.type,
          title: editingEvent.title,
          location: editingEvent.location,
          date: editingEvent.date,
          time: editingEvent.time,
          destination: trip.destination,
        }),
      });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error || "AI assist failed");
      }
      const data = await resp.json();
      setEditingEvent(prev => prev ? {
        ...prev,
        description: data.description || prev.description,
        notes: data.notes || prev.notes,
      } : null);
      toast.success("AI filled in description and notes");
    } catch (err: any) {
      toast.error(err?.message || "AI assist unavailable");
    } finally {
      setAiAssistLoading(false);
    }
  };

  const handleDuplicateEvent = (eventId: string) => {
    if (demoGate()) return;
    const source = trip.events.find(ev => ev.id === eventId);
    if (!source) return;
    const { id, ...rest } = source;
    const duplicate: TravelEvent = { ...rest, id: Date.now().toString(), title: `${source.title} (copy)` };
    updateEvent(trip.id, duplicate);
    toast.success("Event duplicated");
  };

  const handleDeleteEvent = (eventId: string) => {
    if (demoGate()) return;
    deleteEvent(trip.id, eventId);
    toast.success("Event deleted");
  };

  const uploadToStorage = async (file: File, path: string): Promise<string> => {
    if (isFirebaseConfigured() && user?.id !== "demo") {
      const sRef = storageRef(firebaseStorage(), path);
      await uploadBytes(sRef, file, { contentType: file.type });
      return getDownloadURL(sRef);
    }
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.readAsDataURL(file);
    });
  };

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const image = await shrinkImage(file);
      const ext = image === file ? file.name.split(".").pop() : "jpg";
      const path = `trips/${tripId}/cover-${Date.now()}.${ext}`;
      const url = await uploadToStorage(image === file ? file : new File([image], `cover.${ext}`, { type: image.type }), path);
      setEditingTrip(prev => ({ ...prev, image: url, imagePosition: undefined }));
    } catch { toast.error("Cover upload failed"); }
    e.target.value = "";
  };

  const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !editingEvent) return;
    const uploads = files.map(async (file) => {
      const ext = file.name.split(".").pop();
      const path = `trips/${tripId}/events/${editingEvent.id}/media-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const url = await uploadToStorage(file, path);
      return { type: (file.type.startsWith("video/") ? "video" : "image") as "image" | "video", url, name: file.name };
    });
    try {
      const newMedia = await Promise.all(uploads);
      setEditingEvent(prev => prev ? { ...prev, media: [...(prev.media || []), ...newMedia] } : null);
    } catch { toast.error("Media upload failed"); }
    e.target.value = "";
  };

  const handleRemoveMedia = (index: number) => {
    setEditingEvent(prev => prev ? { ...prev, media: (prev.media || []).filter((_, i) => i !== index) } : null);
  };

  const MAX_DOC_BYTES = 8 * 1024 * 1024; // 8MB per doc - keeps localStorage viable

  const handleDocumentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !editingEvent) return;
    const MAX_SIZE = isFirebaseConfigured() && user?.id !== "demo" ? 50 * 1024 * 1024 : MAX_DOC_BYTES;
    const oversized = files.filter(f => f.size > MAX_SIZE);
    if (oversized.length) {
      toast.error(`${oversized.length} file(s) over ${MAX_SIZE >= 50 * 1024 * 1024 ? "50MB" : "8MB"} were skipped`);
    }
    const accepted = files.filter(f => f.size <= MAX_SIZE);
    const uploads = accepted.map(async (file) => {
      const ext = file.name.split(".").pop();
      const path = `trips/${tripId}/docs-${editingEvent.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const url = await uploadToStorage(file, path);
      return {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        url,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
    });
    try {
      const newDocs = await Promise.all(uploads);
      setEditingEvent(prev => prev ? { ...prev, documents: [...(prev.documents || []), ...newDocs] } : null);
    } catch { toast.error("Document upload failed"); }
    e.target.value = "";
  };

  const handleRemoveDocument = (index: number) => {
    setEditingEvent(prev => prev ? { ...prev, documents: (prev.documents || []).filter((_, i) => i !== index) } : null);
  };

  const handleOpenDocument = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const { buildItineraryPdf, loadImage, loadLogo } = await import("@/lib/itineraryPdf");
      const [mapUrl, coverDataUrl, logo] = await Promise.all([
        Promise.race([buildStaticMapUrl(), new Promise<null>(r => setTimeout(() => r(null), 5000))]),
        trip.image ? loadImage(trip.image, 16 / 7) : Promise.resolve(null),
        brand.logoUrl ? loadLogo(brand.logoUrl) : Promise.resolve(null),
      ]);
      const mapDataUrl = mapUrl ? await loadImage(mapUrl, 800 / 300) : null;
      const pdf = await buildItineraryPdf({
        trip,
        brand: { name: brand.name, platformName: brand.platformName, accentColor: brand.accentColor, logo },
        coverDataUrl,
        mapDataUrl,
        includeReferences: true,
      });
      pdf.save(`${trip.name.toLowerCase().replace(/\s+/g, "-")}-itinerary.pdf`);
      toast.success("PDF exported");
    } catch (err) {
      console.error("PDF export failed:", err);
      toast.error("PDF export failed");
    } finally {
      setExporting(false);
    }
  };

  const runTripImageSearch = async (query: string, page = 1) => {
    if (!query.trim()) { setTripImageResults([]); return; }
    setIsTripImageSearching(true);
    setTripImageLastQuery(query);
    setTripImagePage(page);
    try {
      const srcParam = preferredImageSource === "auto" ? undefined : preferredImageSource;
      const { urls } = await searchImages(query, page, 12, srcParam);
      if (urls.length) { setTripImageResults(urls); return; }
      const shuffled = [...COVER_IMAGES].sort(() => Math.random() - 0.5);
      setTripImageResults(shuffled.map(i => i.url));
    } finally {
      setIsTripImageSearching(false);
    }
  };

  const handleOpenEditOrg = () => {
    if (demoGate()) return;
    editBaseline.current = trip;
    setEditOrgData({ ...(trip.organizer ?? {}) });
    setEditOrgOpen(true);
  };
  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demoGate()) return;
    const org = editOrgData.name?.trim() ? editOrgData as Trip["organizer"] : undefined;
    if (!await commitChanges({ organizer: org }, editBaseline.current)) return;
    setEditOrgOpen(false);
    toast.success(org ? "Organizer updated" : "Organizer removed");
  };

  const handleOpenEditInfo = () => {
    if (demoGate()) return;
    editBaseline.current = trip;
    setEditInfoData(trip.info ? trip.info.map(i => ({ ...i, documents: i.documents ? [...i.documents] : undefined })) : []);
    setEditInfoOpen(true);
  };
  // A card's own pencil: the editor opens on that page with the cursor in its text
  const openInfoPage = (id: string) => {
    handleOpenEditInfo();
    window.setTimeout(() => {
      const page = document.querySelector<HTMLElement>(`[data-info-page="${window.CSS.escape(id)}"]`);
      page?.scrollIntoView({ block: "start", behavior: "smooth" });
      page?.querySelector<HTMLTextAreaElement>("textarea")?.focus({ preventScroll: true });
    }, 250);
  };
  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demoGate()) return;
    const cleaned = editInfoData.filter(i => i.title.trim() || i.body.trim() || (i.documents && i.documents.length > 0));
    const save = async () => {
      if (!await commitChanges({ info: cleaned.length > 0 ? cleaned : undefined }, editBaseline.current, { allowClearInfo: true })) return;
      setEditInfoOpen(false);
      toast.success("Information updated");
    };
    // Emptying the section can't be undone, so it is asked for, never assumed
    const had = editBaseline.current?.info?.length ?? 0;
    if (cleaned.length === 0 && had > 0) { setClearing([`all ${had} Trip info cards`]); setConfirmClearInfo(() => save); return; }
    await save();
  };

  const TRIP_DOC_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,.csv,.ppt,.pptx,image/*";

  const handleTripDocFiles = async (files: File[]) => {
    if (!files.length || !trip) return;
    if (demoGate()) return;
    const MAX_SIZE = isFirebaseConfigured() && user?.id !== "demo" ? 50 * 1024 * 1024 : MAX_DOC_BYTES;
    const oversized = files.filter(f => f.size > MAX_SIZE);
    if (oversized.length) {
      toast.error(`${oversized.length} file(s) over ${MAX_SIZE >= 50 * 1024 * 1024 ? "50MB" : "8MB"} were skipped`);
    }
    const accepted = files.filter(f => f.size <= MAX_SIZE);
    if (!accepted.length) return;
    setTripDocUploading(true);
    const toastId = toast.loading(`Uploading ${accepted.length} file${accepted.length > 1 ? "s" : ""}...`);
    const uploads = accepted.map(async (file) => {
      const ext = file.name.split(".").pop();
      const path = `trips/${tripId}/docs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const url = await uploadToStorage(file, path);
      return {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        url,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
    });
    try {
      const newDocs = await Promise.all(uploads);
      updateTrip(trip.id, { documents: [...(trip.documents || []), ...newDocs] });
      toast.success(`${newDocs.length} document${newDocs.length > 1 ? "s" : ""} uploaded`, { id: toastId });
    } catch {
      toast.error("Document upload failed", { id: toastId });
    } finally {
      setTripDocUploading(false);
    }
  };

  const handleTripDocDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setTripDocDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    handleTripDocFiles(files);
  };

  const handleTripDocInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    handleTripDocFiles(files);
    e.target.value = "";
  };

  const handleRemoveTripDoc = (docId: string) => {
    if (!trip || demoGate()) return;
    updateTrip(trip.id, { documents: (trip.documents || []).filter(d => d.id !== docId) });
  };

  const handleRenameTripDoc = (docId: string, newName: string) => {
    if (!trip || demoGate() || !newName.trim()) return;
    updateTrip(trip.id, { documents: (trip.documents || []).map(d => d.id === docId ? { ...d, name: newName.trim() } : d) });
  };

  const handleInfoPageDocFiles = async (files: File[], pageIdx: number) => {
    if (!files.length || !trip) return;
    if (demoGate()) return;
    const MAX_SIZE = isFirebaseConfigured() && user?.id !== "demo" ? 50 * 1024 * 1024 : MAX_DOC_BYTES;
    const accepted = files.filter(f => f.size <= MAX_SIZE);
    if (files.length > accepted.length) toast.error(`${files.length - accepted.length} file(s) too large, skipped`);
    if (!accepted.length) return;
    const toastId = toast.loading(`Uploading ${accepted.length} file${accepted.length > 1 ? "s" : ""}...`);
    const uploads = accepted.map(async (file) => {
      const ext = file.name.split(".").pop();
      const path = `trips/${tripId}/docs-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const url = await uploadToStorage(file, path);
      return {
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        url,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
    });
    try {
      const newDocs = await Promise.all(uploads);
      setEditInfoData(prev => {
        const updated = [...prev];
        updated[pageIdx] = { ...updated[pageIdx], documents: [...(updated[pageIdx].documents || []), ...newDocs] };
        return updated;
      });
      toast.success(`${newDocs.length} file${newDocs.length > 1 ? "s" : ""} attached`, { id: toastId });
    } catch { toast.error("Upload failed", { id: toastId }); }
  };

  const lifecycle = lifecycleLabel(trip);
  /** Put a finished trip away, or bring it back. Travellers keep it on their phones either way. */
  const toggleArchived = () => {
    if (trip.archivedAt) {
      updateTrip(trip.id, { archivedAt: undefined });
      toast.success(`${trip.name} is back on the dashboard`);
    } else {
      updateTrip(trip.id, { archivedAt: new Date().toISOString() });
      toast.success(`${trip.name} archived. Find it under Archived on the dashboard.`);
    }
  };

  /** Hide a trip from everyone else on the team, owners and admins included, or share it again. Only its creator can. */
  const canSetPrivate = isOrgMember && trip.ownerId === user?.id;
  const togglePrivate = () => {
    if (demoGate()) return;
    updateTrip(trip.id, { private: !trip.private });
    toast.success(trip.private
      ? `${trip.name} is shared with your team again`
      : `${trip.name} is private. Only you can see it.`);
  };

  const handleOpenEditTrip = () => {
    if (demoGate()) return;
    editBaseline.current = trip;
    setEditingTrip({
      name: trip.name,
      destination: trip.destination ?? "",
      attendees: trip.attendees,
      start: trip.start,
      end: trip.end,
      status: trip.status,
      image: trip.image,
      imagePosition: trip.imagePosition,
      currency: trip.currency ?? "USD",
      organizer: trip.organizer ?? undefined,
      info: trip.info ? trip.info.map(i => ({ ...i })) : [],
    });
    setTripImageSearch("");
    setTripImageResults([]);
    setEditTripOpen(true);
  };

  const handleSaveTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demoGate()) return;
    // Clean up organizer: null out if name is empty
    const cleaned = { ...editingTrip };
    if (cleaned.organizer && !cleaned.organizer.name?.trim()) {
      cleaned.organizer = undefined;
    }
    // Filter out empty info entries
    if (cleaned.info) {
      cleaned.info = cleaned.info.filter(i => i.title.trim() || i.body.trim() || (i.documents && i.documents.length > 0));
      if (cleaned.info.length === 0) cleaned.info = undefined;
    }
    const save = async () => {
      if (!await commitChanges(cleaned, editBaseline.current, { allowClearInfo: true })) return;
      setEditTripOpen(false);
      toast.success("Trip updated");
    };
    // Emptying a section, or the organiser's name, can't be undone, so it is asked for, never assumed
    const base = editBaseline.current;
    const losing = [
      !cleaned.info && (base?.info?.length ?? 0) > 0 ? `all ${base!.info!.length} Trip info cards` : "",
      !cleaned.organizer && base?.organizer?.name?.trim() ? `the organiser (${base.organizer.name.trim()})` : "",
    ].filter(Boolean);
    if (losing.length) { setClearing(losing); setConfirmClearInfo(() => save); return; }
    await save();
  };

  const handleDeleteTrip = () => {
    if (demoGate()) return;
    deleteTrip(trip.id);
    navigate("/dashboard");
    toast.success("Trip deleted");
  };

  const handleShareTrip = () => setShareOpen(true);

  const handleSendEmail = () => setSendInviteOpen(true);

  // Latest handlers for the command palette's trip actions; the listener is set up above the early return
  paletteActions.current = { publish: handlePublish, share: handleShareTrip, email: handleSendEmail };

  return (
    <div className="flex flex-col h-screen bg-background w-full relative overflow-hidden">
      {/* Header */}
      <header className="h-14 bg-card border-b border-border px-3 sm:px-4 lg:px-6 flex items-center gap-3 sticky top-0 z-50">
          <Button variant="ghost" size="icon" aria-label="Go back to dashboard" onClick={() => navigate("/dashboard")} className="h-9 w-9 rounded-lg hover:bg-secondary text-foreground shrink-0"><CaretLeft className="h-5 w-5" /></Button>
          <div className="min-w-0 hidden sm:block">
            <h2 className="text-sm font-semibold text-foreground leading-tight truncate flex items-center gap-1.5">
              <span className="truncate">{trip.name}</span>
              {trip.private && <span className="inline-flex items-center gap-1 shrink-0 text-[11px] font-medium text-muted-foreground"><LockSimple className="h-3 w-3" weight="bold" /> Private</span>}
            </h2>
            <p className="text-xs text-muted-foreground leading-tight truncate">{tripFactLine(trip)}</p>
          </div>

        {/* Presence avatars */}
        {presenceUsers.length > 0 && (
          <div className="hidden sm:flex items-center -space-x-2 mr-2">
            {presenceUsers.slice(0, 5).map((p) => (
              <Tooltip key={p.userId}>
                <TooltipTrigger render={<div className="relative" />}>
                    {/* A photo that fails to load falls back to initials instead of an empty circle */}
                    <Avatar className="ring-2 ring-card">
                      {p.avatar && <AvatarImage src={p.avatar} alt={p.name} className="bg-secondary" />}
                      <AvatarFallback className="text-[10px] font-semibold uppercase">{p.initials}</AvatarFallback>
                    </Avatar>
                    <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-green-400 border-2 border-white dark:border-card" />
                </TooltipTrigger>
                <TooltipContent side="bottom" className="text-xs">
                  <span className="font-bold">{p.name || "Team member"}</span>
                  {p.activeDay && (
                    <span className="text-muted-foreground ml-1">
                      · Day {groupedEvents.findIndex(([d]) => d === p.activeDay) + 1 || "?"}
                    </span>
                  )}
                </TooltipContent>
              </Tooltip>
            ))}
            {presenceUsers.length > 5 && (
              <div className="h-8 w-8 rounded-full border-2 border-white dark:border-card bg-secondary flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                +{presenceUsers.length - 5}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
          {/* View As dropdown */}
          {tripTravelers.length > 0 && (
            <Popover>
              <PopoverTrigger className={`hidden sm:flex h-10 items-center gap-2 px-3 rounded-xl border transition-all text-xs font-medium shadow-sm cursor-pointer ${
                viewAsId
                  ? "bg-brand/10 border-brand/30 text-brand"
                  : "bg-card border-border text-muted-foreground hover:text-brand"
              }`}>
                <Users className="h-3.5 w-3.5" />
                <span className={viewAsTraveler ? "" : "hidden xl:inline"}>{viewAsTraveler ? `Viewing as ${viewAsTraveler.name.split(" ")[0]}` : "View as"}</span>
              </PopoverTrigger>
              <PopoverContent align="end" initialFocus={type => type === "keyboard"} className="w-56 p-2 gap-0 bg-card border border-border shadow-2xl rounded-xl max-h-[min(26rem,var(--available-height))] overflow-y-auto">
                <button
                  onClick={() => setViewAsId(null)}
                  className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-bold transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                    !viewAsId ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <div className="h-7 w-7 rounded-full bg-secondary flex items-center justify-center text-muted-foreground"><Users className="h-3.5 w-3.5" /></div>
                  <span>Everyone</span>
                  {!viewAsId && <Check className="h-3 w-3 ml-auto" />}
                </button>
                <div className="h-px bg-secondary my-1" />
                {tripTravelers.map(t => (
                  <button
                    key={t.id}
                    onClick={() => setViewAsId(t.id)}
                    className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-xs font-bold transition-colors text-left outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                      viewAsId === t.id ? "bg-brand/10 text-brand" : "text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    <PersonAvatar avatar={t.avatar} initials={t.initials} name={t.name} className="h-7 w-7" fallbackClassName="bg-brand/10 text-brand text-[9px] font-black" />
                    <span className="truncate">{t.name}</span>
                    {viewAsId === t.id && <Check className="h-3 w-3 ml-auto shrink-0" />}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          {/* Desktop toolbar: View (segmented) · Share · Trip · Notifications · Publish */}
          {(() => {
            const panelBtn = (active: boolean) =>
              `h-8 px-2.5 rounded-md flex items-center gap-1.5 text-xs font-medium transition-colors ${
                active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`;
            const menuBtn = "hidden sm:flex h-9 px-3 rounded-lg border border-border bg-card text-foreground hover:bg-secondary transition-colors text-sm font-medium items-center gap-1.5 cursor-pointer";
            const item = "flex items-center gap-2.5 text-sm rounded-lg cursor-pointer";
            return (
              <>
                <div role="group" aria-label="Side panels" className="hidden sm:flex items-center p-0.5 rounded-lg bg-secondary">
                  <button type="button" aria-pressed={showTasks} title="Tasks" onClick={() => { setShowTasks(!showTasks); if (!showTasks) { setShowMap(false); setShowMobilePreview(false); setShowAssistant(false); setShowCosts(false); } }} className={panelBtn(showTasks)}>
                    <ListChecks className="h-4 w-4" /> <span className="hidden lg:inline">Tasks</span>
                  </button>
                  <button type="button" aria-pressed={showCosts} title="Costs" onClick={() => { setShowCosts(!showCosts); if (!showCosts) { setShowMap(false); setShowTasks(false); setShowMobilePreview(false); setShowAssistant(false); } }} className={panelBtn(showCosts)}>
                    <Wallet className="h-4 w-4" /> <span className="hidden lg:inline">Costs</span>
                  </button>
                  <button type="button" aria-pressed={showMap} title="Map" onClick={() => { setShowMap(!showMap); if (!showMap) { setShowTasks(false); setShowMobilePreview(false); setShowAssistant(false); setShowCosts(false); } }} className={panelBtn(showMap)}>
                    <MapIcon className="h-4 w-4" /> <span className="hidden lg:inline">Map</span>
                  </button>
                  <button type="button" aria-pressed={showMobilePreview} title="Phone preview" onClick={() => { setShowMobilePreview(!showMobilePreview); if (!showMobilePreview) { setShowMap(false); setShowTasks(false); setShowAssistant(false); setShowCosts(false); } }} className={panelBtn(showMobilePreview)}>
                    <DeviceMobileCamera className="h-4 w-4" /> <span className="hidden lg:inline">Phone</span>
                  </button>
                  {!isViewer && (
                    <button type="button" aria-pressed={showAssistant} title="Trip assistant" onClick={() => { setShowAssistant(!showAssistant); if (!showAssistant) { setShowMap(false); setShowTasks(false); setShowMobilePreview(false); setShowCosts(false); } }} className={panelBtn(showAssistant)}>
                      <ChatCircleText className="h-4 w-4" /> <span className="hidden lg:inline">Assistant</span>
                    </button>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger className={menuBtn} aria-label="Share and export">
                    <ShareNetwork className="h-4 w-4" /> <span className="hidden lg:inline">Share</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card border border-border shadow-2xl rounded-xl p-1">
                    <DropdownMenuItem onClick={handleSendEmail} className={item}><EnvelopeOpen className="h-4 w-4 text-muted-foreground" /> Email itinerary</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMessageOpen(true)} className={item}><Megaphone className="h-4 w-4 text-muted-foreground" /> Send a message</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleShareTrip} className={item}><ShareNetwork className="h-4 w-4 text-muted-foreground" /> Link and PIN</DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-secondary" />
                    <DropdownMenuItem onClick={() => setPreviewOpen(true)} className={item}><Eye className="h-4 w-4" /> Preview itinerary</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportPdf} disabled={exporting} className={item}>{exporting ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} {exporting ? "Exporting..." : "Export PDF"}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger className={menuBtn} aria-label="Trip settings">
                    <DotsThreeVertical className="h-4 w-4" weight="bold" /><span className="sr-only">More</span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56 bg-card border border-border shadow-2xl rounded-xl p-1">
                    <DropdownMenuItem onClick={handleOpenEditTrip} className={item}><Pencil className="h-4 w-4" /> Edit details</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setReimportOpen(true)} className={item}><Upload className="h-4 w-4" /> Import from document</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleGeocodeAll} disabled={geocoding} className={item}>{geocoding ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} {geocoding ? "Geocoding..." : "Geocode locations"}</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setPhotosOpen(true)} className={item}><ImageSquare className="h-4 w-4" /> Event photos</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setHistoryOpen(true)} className={item}><ClockCounterClockwise className="h-4 w-4" /> History</DropdownMenuItem>
                    {canSetPrivate && (
                      <DropdownMenuItem onClick={togglePrivate} className={item}>{trip.private ? <UsersThree className="h-4 w-4" /> : <LockSimple className="h-4 w-4" />} {trip.private ? "Share with team" : "Make private"}</DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={toggleArchived} className={item}>{trip.archivedAt ? <ArrowCounterClockwise className="h-4 w-4" /> : <Archive className="h-4 w-4" />} {trip.archivedAt ? "Unarchive trip" : "Archive trip"}</DropdownMenuItem>
                    {(!isOrgMember || canDeleteTrip) && (
                      <>
                        <DropdownMenuSeparator className="bg-secondary" />
                        <DropdownMenuItem onClick={() => setDeleteConfirmOpen(true)} className={`${item} text-red-500 focus:text-red-500`}><Trash className="h-4 w-4" /> Delete trip</DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Same light and dark switch as every other page's header */}
                <button
                  type="button"
                  aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                  onClick={toggleTheme}
                  className="h-10 w-10 shrink-0 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center justify-center"
                >
                  {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                <NotificationPanel />
              </>
            );
          })()}

          {/* Mobile overflow menu */}
          <DropdownMenu>
            <DropdownMenuTrigger aria-label="More actions" className="sm:hidden h-10 w-10 rounded-xl bg-card hover:bg-secondary text-muted-foreground hover:text-brand transition-all border border-border flex items-center justify-center cursor-pointer shadow-sm">
                <DotsThreeVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-card border border-border shadow-2xl rounded-xl p-1">
              <DropdownMenuItem onClick={() => { setShowTasks(!showTasks); if (!showTasks) { setShowMap(false); setShowMobilePreview(false); setShowAssistant(false); setShowCosts(false); } }} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <ListChecks className="h-4 w-4 text-brand" /> {showTasks ? "Hide Tasks" : "Tasks"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setShowCosts(!showCosts); if (!showCosts) { setShowMap(false); setShowTasks(false); setShowMobilePreview(false); setShowAssistant(false); } }} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <Wallet className="h-4 w-4 text-brand" /> {showCosts ? "Hide Costs" : "Costs"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setShowMap(!showMap); if (!showMap) { setShowTasks(false); setShowMobilePreview(false); setShowAssistant(false); setShowCosts(false); } }} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <MapIcon className="h-4 w-4 text-brand" /> {showMap ? "Hide Map" : "Show Map"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setShowMobilePreview(!showMobilePreview); if (!showMobilePreview) { setShowMap(false); setShowTasks(false); setShowAssistant(false); setShowCosts(false); } }} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <DeviceMobileCamera className="h-4 w-4 text-brand" /> {showMobilePreview ? "Hide Mobile" : "Mobile Preview"}
              </DropdownMenuItem>
              {!isViewer && (
                <DropdownMenuItem onClick={() => { setShowAssistant(!showAssistant); if (!showAssistant) { setShowMap(false); setShowTasks(false); setShowMobilePreview(false); setShowCosts(false); } }} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                  <ChatCircleText className="h-4 w-4 text-brand" /> {showAssistant ? "Hide Assistant" : "Trip Assistant"}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setPreviewOpen(true)} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <Eye className="h-4 w-4" /> Preview
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleOpenEditTrip} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <Pencil className="h-4 w-4" /> Edit Trip
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setReimportOpen(true)} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <Upload className="h-4 w-4" /> Import from document
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPhotosOpen(true)} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <ImageSquare className="h-4 w-4" /> Event photos
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHistoryOpen(true)} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <ClockCounterClockwise className="h-4 w-4" /> History
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleGeocodeAll} disabled={geocoding} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                {geocoding ? <SpinnerGap className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />} {geocoding ? "Geocoding..." : "Geocode Locations"}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-secondary" />
              <DropdownMenuItem onClick={handleShareTrip} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <ShareNetwork className="h-4 w-4" /> Link and PIN
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleSendEmail} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <EnvelopeOpen className="h-4 w-4" /> Email itinerary
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMessageOpen(true)} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <Megaphone className="h-4 w-4" /> Send a message
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf} disabled={exporting} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer">
                <FileText className="h-4 w-4" /> Export PDF
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-secondary" />
              {(!isOrgMember || canDeleteTrip) && (
                <>
                  <DropdownMenuSeparator className="bg-secondary" />
                  <DropdownMenuItem onClick={() => setDeleteConfirmOpen(true)} className="flex items-center gap-2.5 text-xs font-medium rounded-lg cursor-pointer text-red-500 focus:text-red-500">
                    <Trash className="h-4 w-4" /> Delete Trip
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            onClick={handlePublish}
            disabled={publishing}
            variant={pendingChanges === 0 ? "outline" : "default"}
            aria-label={pendingChanges === 0 ? "Published and up to date. Publish again" : pendingChanges > 0 ? `Publish ${pendingChanges} changes` : "Publish trip"}
            title={pendingChanges === 0 ? "Travellers see the latest version" : pendingChanges > 0 ? "Travellers don't see these changes until you publish" : "Travellers can't see this trip until it's published"}
            className="relative font-semibold h-9 w-9 sm:w-auto px-0 sm:px-4 rounded-lg gap-1.5"
          >
            {publishing ? <SpinnerGap className="h-4 w-4 animate-spin" /> : (
              <>
                {pendingChanges === 0 ? <Check className="h-4 w-4" /> : <PaperPlaneTilt className="h-4 w-4 sm:hidden" />}
                <span className="hidden sm:inline">
                  {pendingChanges === 0 ? "Up to date" : pendingChanges > 0 ? `Publish ${pendingChanges} ${pendingChanges === 1 ? "change" : "changes"}` : "Publish"}
                </span>
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Day sidebar */}
        <aside className="w-64 border-r border-border bg-card flex flex-col hidden lg:flex shadow-sm relative z-30">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Days</span>
            {!isViewer && <Button variant="outline" size="icon" aria-label="Add event" onClick={() => handleAddEvent()} className="h-7 w-7 rounded-md border-border text-foreground hover:bg-secondary"><Plus className="h-3.5 w-3.5" /></Button>}
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-1">
              {groupedEvents.map(([date, dayEvents], i) => {
                const flights = dayEvents.filter(e => e.type === "flight");
                const hotels = dayEvents.filter(e => e.type === "hotel");
                const highlight = (flights[0]?.title || hotels[0]?.title || dayEvents[0]?.title || "").replace(/\s*[—–]\s*/g, " - ");
                const isActive = i === activeDayIdx;
                const dayPeers = presenceUsers.filter(p => p.activeDay === date);
                return (
                  <button
                    key={date}
                    onClick={() => {
                      setActiveDayIdx(i);
                      updateActivity(date);
                      document.getElementById(`day-${date}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    aria-current={isActive ? "true" : undefined}
                    className={`w-full text-left px-2.5 py-2.5 rounded-xl group relative transition-colors ${isActive ? "bg-secondary" : "hover:bg-secondary/60"}`}
                  >
                    <div className="flex items-center gap-3 relative z-10">
                      <div className="relative shrink-0">
                        <div className={`h-10 w-10 rounded-lg flex flex-col items-center justify-center transition-colors ${isActive ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground group-hover:bg-card"}`}>
                          <span className="text-[9px] font-semibold uppercase leading-none tracking-wide">{parseTripDate(date).toLocaleDateString("en-GB", { month: "short" })}</span>
                          <span className="text-[15px] font-bold leading-none mt-0.5 tabular-nums">{parseTripDate(date).getDate()}</span>
                        </div>
                        {dayPeers.length > 0 && (
                          <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-emerald-500 border-2 border-card flex items-center justify-center text-[8px] font-bold text-white">
                            {dayPeers.length}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-muted-foreground">Day {i + 1}, {parseTripDate(date).toLocaleDateString("en-GB", { weekday: "short" })}</span>
                          {date === todayIso && <span className="rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold text-foreground">Today</span>}
                          <span className="ml-auto text-[11px] text-muted-foreground tabular-nums">{dayEvents.length}</span>
                        </div>
                        <span className={`text-[13px] truncate leading-tight ${isActive ? "font-semibold text-foreground" : "font-medium text-foreground/85"}`}>{highlight || "Nothing planned"}</span>
                        {dayPeers.length > 0 && (
                          <div className="flex -space-x-1 mt-1">
                            {dayPeers.slice(0, 3).map(p => (
                              <div key={p.userId} className="h-4 w-4 rounded-full bg-secondary border border-card flex items-center justify-center text-[7px] font-bold text-foreground uppercase">{p.initials.slice(0, 1)}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </aside>

        <div className="flex-1 flex flex-row overflow-hidden relative">
          <main ref={printRef} className={`flex-1 min-w-0 flex flex-col relative bg-background overflow-y-auto transition-all duration-500 ${showMobilePreview && previewWidth ? "" : showMap || showTasks || showCosts || showMobilePreview || showAssistant ? "lg:w-[60%]" : "w-full"}`}>
            {/* Trip banner */}
            <section data-workspace-hero className="relative h-auto min-h-[280px] sm:h-[340px] lg:h-[400px] w-full group overflow-hidden shrink-0">
              <img src={trip.image} className="h-full w-full object-cover" style={{ objectPosition: objectPosition(trip.imagePosition) }} alt={trip.name} />
              {/* Multi-layer gradient for depth */}
              <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-black/5" />
              <div className="absolute inset-0 bg-linear-to-r from-black/30 to-transparent" />

              {/* Top row: status */}
              <div className="absolute top-4 sm:top-6 left-4 sm:left-6 lg:left-8 right-4 sm:right-6 lg:right-8 z-20 flex items-center">
                <Badge className={`rounded-md px-2.5 py-1 text-xs font-medium border-none ${lifecycle === "Published" || lifecycle === "Active" ? "bg-primary text-primary-foreground" : "bg-white/20 text-white"}`}>
                  {lifecycle}
                </Badge>
              </div>

              {/* Bottom: trip identity */}
              <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 lg:p-8 z-20">
                {trip.destination && (
                  <p className="text-xs font-medium text-white/80 mb-1.5">{trip.destination}</p>
                )}
                <h3 className="text-3xl lg:text-4xl font-bold tracking-tight leading-tight text-white mb-2">{trip.name}</h3>
                <p className="text-base font-medium text-white/90">{tripFactLine(trip)}{trip.attendees ? ` · ${trip.attendees}` : ""}</p>
                <p className="text-sm text-white/70 mt-0.5">{shortDay(trip.start)} → {shortDay(trip.end)}</p>
              </div>
            </section>

            {/* View As banner */}
            {viewAsTraveler && (
              <div className="mx-3 sm:mx-4 lg:mx-10 mt-4 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-brand/10 border border-brand/20">
                <Users className="h-4 w-4 text-brand shrink-0" />
                <p className="text-xs font-medium text-brand flex-1">
                  Viewing as {viewAsTraveler.name} - showing {groupedEvents.reduce((n, [, evs]) => n + evs.length, 0)} events
                </p>
                <button onClick={() => setViewAsId(null)} className="text-xs font-medium text-brand/70 hover:text-brand transition-colors flex items-center gap-1">
                  <X className="h-3 w-3" /> Clear
                </button>
              </div>
            )}

            {/* Tab bar */}
            <div className="px-3 sm:px-4 lg:px-10 pt-6 shrink-0">
              <div className="flex gap-1">
                {(["itinerary", "media", "people"] as const).map(t => {
                  const active = activeTab === t;
                  const count = t === "media" ? (trip.media?.length ?? 0) : t === "people" ? (trip.travelerIds?.length ?? 0) : 0;
                  return (
                    <button
                      key={t}
                      onClick={() => setActiveTab(t)}
                      className={`flex-none h-9 px-4 rounded-lg text-sm font-medium border transition-colors flex items-center gap-2 ${
                        active
                          ? "bg-foreground text-background border-transparent"
                          : "bg-card text-muted-foreground border-border hover:text-foreground"
                      }`}
                    >
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                      {count > 0 && (
                        <span className={`text-[10px] font-semibold rounded-md px-1.5 py-0.5 leading-none tabular-nums ${active ? "bg-background/20" : "bg-secondary text-muted-foreground"}`}>
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Itinerary tab */}
            {activeTab === "itinerary" && (
              <>
                <div className="px-3 sm:px-4 lg:px-10 pt-6 sm:pt-10 pb-32 w-full relative">

                  {/* ── Organizer & Info strip (Travefy-inspired) ── */}
                  {(trip.organizer?.name || (trip.info && trip.info.length > 0) || (trip.documents && trip.documents.length > 0) || !isViewer) && (
                    <div className="mb-8 space-y-3">
                      {/* Organizer contact card */}
                      {trip.organizer?.name && (
                        <div className="group/org rounded-xl bg-card border border-border overflow-hidden hover:border-brand/30 transition-colors">
                          <div className="flex items-center gap-4 p-5">
                            {/* Avatar */}
                            <div className="shrink-0 w-12 h-12 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center overflow-hidden">
                              {trip.organizer.avatar ? (
                                <img src={trip.organizer.avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-lg font-bold text-brand tracking-tight">
                                  {trip.organizer.name.split(" ").slice(0, 2).map(w => w[0]).join("")}
                                </span>
                              )}
                            </div>
                            {/* Name + meta */}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-muted-foreground mb-1">Organizer</p>
                              <p className="text-base font-extrabold text-foreground truncate">{trip.organizer.name}</p>
                              {(trip.organizer.role || trip.organizer.company) && (
                                <p className="text-xs text-muted-foreground font-medium truncate mt-0.5">
                                  {[trip.organizer.role, trip.organizer.company].filter(Boolean).join(" · ")}
                                </p>
                              )}
                            </div>
                            {/* Action buttons */}
                            <div className="flex items-center gap-2 shrink-0">
                              {trip.organizer.email && (
                                <a href={`mailto:${trip.organizer.email}`} className="h-10 px-4 rounded-xl bg-brand/10 border border-brand/20 flex items-center gap-2 text-brand hover:bg-brand/20 transition-colors">
                                  <Envelope className="h-3.5 w-3.5" />
                                  <span className="text-xs font-medium hidden sm:inline">Email</span>
                                </a>
                              )}
                              {trip.organizer.phone && (
                                <a href={`tel:${trip.organizer.phone}`} className="h-10 px-4 rounded-xl bg-brand/10 border border-brand/20 flex items-center gap-2 text-brand hover:bg-brand/20 transition-colors">
                                  <Phone className="h-3.5 w-3.5" />
                                  <span className="text-xs font-medium hidden sm:inline">Call</span>
                                </a>
                              )}
                              <button onClick={handleOpenEditOrg} aria-label="Edit organiser" className="h-10 w-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Information & Documents card */}
                      {((trip.info && trip.info.length > 0) || (trip.documents && trip.documents.length > 0) || !isViewer) && (
                        <div
                          className={`group/info rounded-xl bg-card border overflow-hidden transition-colors ${tripDocDragOver ? "border-brand bg-brand/5 dark:bg-brand/5" : "border-border hover:border-brand/30"}`}
                          onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setTripDocDragOver(true); }}
                          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setTripDocDragOver(false); }}
                          onDrop={handleTripDocDrop}
                        >
                          <div className="p-5">
                            <div className="flex items-center gap-2.5 mb-4">
                              <FileText className="h-5 w-5 text-muted-foreground" />
                              <h3 className="text-lg font-semibold tracking-tight text-foreground">Trip information</h3>
                              <span className="text-xs font-medium text-muted-foreground bg-secondary px-2 py-0.5 rounded-md tabular-nums">{(trip.info?.length || 0) + (trip.documents?.length || 0)}</span>
                              <button onClick={handleOpenEditInfo} className="ml-auto h-8 px-3 rounded-lg bg-secondary border border-border flex items-center gap-1.5 text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors">
                                <Pencil className="h-3 w-3" />
                                <span className="text-[11px] font-medium">Edit</span>
                              </button>
                            </div>

                            {/* Info emptied here while travellers still see the published pages: offer them back for review */}
                            {!isViewer && !trip.info?.length && (trip.publishedSnapshot?.info?.length ?? 0) > 0 && (
                              <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary px-4 py-3">
                                <p className="text-sm text-foreground">Travellers still see {trip.publishedSnapshot!.info!.length} info {trip.publishedSnapshot!.info!.length === 1 ? "page" : "pages"} from the published version, but none are here.</p>
                                <button
                                  type="button"
                                  onClick={() => { handleOpenEditInfo(); setEditInfoData(trip.publishedSnapshot!.info!.map(i => ({ ...i, documents: i.documents ? [...i.documents] : undefined }))); }}
                                  className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shrink-0"
                                >
                                  Review and restore
                                </button>
                              </div>
                            )}

                            {/* Info pages */}
                            {trip.info && trip.info.length > 0 && (
                            <div className="space-y-2">
                              {trip.info.map(item => {
                                // Only a card with more than its two-line preview (or attachments) opens; the rest show in full
                                const hasMore = (item.body?.split("\n").length ?? 0) > 2 || (item.body?.length ?? 0) > 160 || (item.documents?.length ?? 0) > 0;
                                const isExpanded = hasMore && expandedInfoIds.has(item.id);
                                return (
                                <div key={item.id} className="group/card relative rounded-xl bg-background border border-border overflow-hidden hover:border-brand/30 transition-colors">
                                  {!isViewer && (
                                    <button
                                      type="button"
                                      aria-label={`Edit ${item.title || "page"}`}
                                      onClick={() => openInfoPage(item.id)}
                                      className={`absolute top-2.5 ${hasMore ? "right-10" : "right-3"} z-10 h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary sm:opacity-0 sm:group-hover/card:opacity-100 focus-visible:opacity-100 transition-all`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                  <button type="button" disabled={!hasMore} aria-expanded={hasMore ? isExpanded : undefined} onClick={() => setExpandedInfoIds(prev => { const next = new Set(prev); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} className="w-full text-left cursor-pointer disabled:cursor-default">
                                    <div className="flex items-start gap-3 p-3.5">
                                      <div className="shrink-0 w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center mt-0.5">
                                        <FileText className="h-3.5 w-3.5 text-brand" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-foreground">
                                          {item.title || "Untitled"}
                                          {item.leaderOnly && (
                                            <span className="inline-flex items-center gap-1 ml-2 text-[11px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded align-middle">
                                              <EyeSlash className="h-2.5 w-2.5" /> Leader only
                                            </span>
                                          )}
                                        </p>
                                        {item.body && (
                                          <p className={`text-xs text-muted-foreground font-medium mt-1 leading-relaxed whitespace-pre-line ${isExpanded || !hasMore ? "" : "line-clamp-2"}`}><Linkify text={item.body} /></p>
                                        )}
                                        {item.documents && item.documents.length > 0 && !isExpanded && (
                                          <p className="text-[10px] text-brand font-bold mt-1">{item.documents.length} attachment{item.documents.length > 1 ? "s" : ""}</p>
                                        )}
                                      </div>
                                      {hasMore && <CaretRight className={`h-4 w-4 text-muted-foreground shrink-0 mt-1 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`} />}
                                    </div>
                                  </button>
                                  {isExpanded && item.documents && item.documents.length > 0 && (
                                    <div className="px-3.5 pb-3 space-y-1">
                                      {item.documents.map(doc => (
                                        <a key={doc.id} href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border hover:border-brand/30 transition-colors">
                                          <Paperclip className="h-3 w-3 text-brand shrink-0" />
                                          <span className="text-xs font-bold text-foreground truncate flex-1">{doc.name}</span>
                                          <span className="text-[9px] text-muted-foreground font-medium shrink-0">{formatFileSize(doc.size)}</span>
                                        </a>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                );
                              })}
                            </div>
                            )}

                            {/* Trip-level documents */}
                            {trip.documents && trip.documents.length > 0 && (
                              <div className={trip.info && trip.info.length > 0 ? "mt-4" : ""}>
                                {trip.info && trip.info.length > 0 && (
                                  <div className="flex items-center gap-3 mb-3">
                                    <div className="h-px flex-1 bg-secondary" />
                                    <span className="text-[11px] font-medium text-muted-foreground">Documents</span>
                                    <div className="h-px flex-1 bg-secondary" />
                                  </div>
                                )}
                                <div className="space-y-1.5">
                                  {trip.documents.map(doc => (
                                    <div key={doc.id} className="group/doc flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-background border border-border hover:border-brand/30 transition-colors">
                                      <div className="shrink-0 w-8 h-8 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                                        <Paperclip className="h-3.5 w-3.5 text-brand" />
                                      </div>
                                      <div className="min-w-0 flex-1">
                                        {renamingDocId === doc.id ? (
                                          <Input
                                            autoFocus
                                            value={renameValue}
                                            onChange={e => setRenameValue(e.target.value)}
                                            onBlur={() => { handleRenameTripDoc(doc.id, renameValue); setRenamingDocId(null); }}
                                            onKeyDown={e => { if (e.key === "Enter") { handleRenameTripDoc(doc.id, renameValue); setRenamingDocId(null); } if (e.key === "Escape") setRenamingDocId(null); }}
                                            className="w-full font-bold"
                                          />
                                        ) : (
                                          <button type="button" onClick={() => handleOpenDocument(doc.url)} onDoubleClick={(e) => { e.stopPropagation(); setRenamingDocId(doc.id); setRenameValue(doc.name); }} className="text-left w-full">
                                            <p className="text-sm font-bold text-foreground truncate">{doc.name}</p>
                                          </button>
                                        )}
                                        <p className="text-[10px] text-muted-foreground font-medium">{formatFileSize(doc.size)}</p>
                                      </div>
                                      {!isViewer && (
                                        <button type="button" onClick={() => handleRemoveTripDoc(doc.id)} className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover/doc:opacity-100 transition-all">
                                          <Trash className="h-3 w-3" />
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Drop zone */}
                            {!isViewer && (
                              <div className={`${(trip.info?.length || trip.documents?.length) ? "mt-4" : ""}`}>
                                <input ref={tripDocInputRef} type="file" multiple accept={TRIP_DOC_ACCEPT} onChange={handleTripDocInput} className="hidden" />
                                <button
                                  type="button"
                                  onClick={() => tripDocInputRef.current?.click()}
                                  className={`w-full py-2.5 px-4 rounded-xl border-2 border-dashed transition-all flex flex-col items-center gap-1.5 ${tripDocDragOver ? "border-brand bg-brand/10 dark:bg-brand/10" : "border-border hover:border-brand/40 bg-slate-50/50 dark:bg-[#080808]"}`}
                                >
                                  <Upload className={`h-5 w-5 ${tripDocDragOver ? "text-brand" : "text-muted-foreground"}`} />
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {tripDocDragOver ? "Drop to upload" : "Drop files here or click to upload"}
                                  </span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Repeated or missing event photos: one place to sort them all */}
                  {!isViewer && (() => {
                    const seen = new Map<string, number>();
                    for (const e of trip.events) if (e.image) seen.set(e.image, (seen.get(e.image) ?? 0) + 1);
                    const needs = trip.events.filter(e => !e.image || (seen.get(e.image) ?? 0) > 1).length;
                    return needs > 0 && (
                      <div className="mb-6 ml-0 sm:ml-8 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-secondary px-4 py-3">
                        <p className="text-sm text-foreground">{needs} {needs === 1 ? "event has" : "events have"} a repeated or missing photo.</p>
                        <Button type="button" size="sm" variant="outline" onClick={() => setPhotosOpen(true)}>Review photos</Button>
                      </div>
                    );
                  })()}

                  <div className="space-y-8">
                    {groupedEvents.length > 0 ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                      {groupedEvents.map(([date, events], dayIdx) => (
                        <div key={date} id={`day-${date}`} className="scroll-mt-6">
                          <DaySection dayNumber={dayIdx + 1} count={events.length} date={parseTripDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }).toUpperCase()} onAddEvent={() => handleAddEvent()}>
                            <SortableContext items={events.map(e => e.id)} strategy={verticalListSortingStrategy}>
                              <div className="ml-0 sm:ml-8 rounded-xl border border-border bg-card shadow-sm divide-y divide-border [&>*:first-child>:last-child]:rounded-t-xl [&>*:last-child>:last-child]:rounded-b-xl [&>*:first-child_.group]:rounded-t-xl [&>*:last-child_.group]:rounded-b-xl">
                                {events.map(event => (
                                  <SortableEventCard
                                    key={event.id}
                                    event={event}
                                    onClick={() => handleEditEvent(event)}
                                    onDuplicate={() => handleDuplicateEvent(event.id)}
                                    onDelete={() => handleDeleteEvent(event.id)}
                                    assignedPeople={
                                      event.assignedTo?.length
                                        ? event.assignedTo.map(id => {
                                            const t = allTravelers.find(u => u.id === id);
                                            return t ? { initials: t.initials, name: t.name, avatar: t.avatar } : { initials: "?", name: "Unknown" };
                                          })
                                        : undefined
                                    }
                                    tripTz={tripTz}
                                  />
                                ))}
                              </div>
                            </SortableContext>
                          </DaySection>
                        </div>
                      ))}
                    </DndContext>
                  ) : (
                      <div className={`flex flex-col items-center justify-center py-32 bg-card border-2 border-dashed border-border rounded-xl text-muted-foreground transition-colors ${isViewer ? "" : "hover:border-brand cursor-pointer group"}`} onClick={isViewer ? undefined : () => handleAddEvent()}>
                        <Plus className={`h-12 w-12 mb-4 opacity-20 ${isViewer ? "" : "group-hover:scale-110 group-hover:text-brand"} transition-all`} />
                        <p className="font-bold text-xs uppercase tracking-[0.3em]">{isViewer ? "NO EVENTS YET" : "ADD YOUR FIRST EVENT"}</p>
                      </div>
                    )}
                  </div>
                </div>
                {!isViewer && (
                  <div className={showMap || showTasks || showCosts || showMobilePreview || showAssistant ? "hidden lg:block" : ""}>
                    <div aria-hidden="true" className="h-28" />
                    <DockBar onAddEvent={handleAddEvent} />
                  </div>
                )}
              </>
            )}

            {/* Media tab */}
            {activeTab === "media" && (
              <TripMediaGallery
                tripId={trip.id}
                media={trip.media ?? []}
                onUpdate={(media) => updateTrip(trip.id, { media })}
                uploaderName={user?.name}
              />
            )}

            {activeTab === "people" && (
              <div className="px-3 sm:px-4 lg:px-10 pt-6 sm:pt-10 pb-32 w-full">
                <div className="w-full space-y-8">
                  {/* Trip Travelers */}
                  <div>
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="min-w-0">
                        <h3 className="text-lg font-semibold tracking-tight text-foreground">Trip travellers</h3>
                        {(() => {
                          // Who has the app is what an organiser chases, so it leads: a count and a bar
                          const total = tripTravelers.length;
                          const inApp = tripTravelers.filter(t => memberByTraveler.has(t.id)).length;
                          if (!total) return <p className="text-sm text-muted-foreground mt-0.5">No one on this trip yet</p>;
                          if (!membersLoaded) return <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">{total} on this trip</p>;
                          return (
                            <div className="mt-1.5">
                              <p className="text-sm text-foreground tabular-nums">
                                <span className="font-semibold">{inApp} of {total}</span> <span className="text-muted-foreground">have the app</span>
                              </p>
                              <div className="mt-2 h-1.5 w-48 max-w-full rounded-full bg-secondary overflow-hidden" role="img" aria-label={`${inApp} of ${total} have the app`}>
                                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round((inApp / total) * 100)}%` }} />
                              </div>
                              {inApp < total && <p className="text-xs text-muted-foreground mt-2">{total - inApp} still to join. Share the trip PIN or link with them.</p>}
                            </div>
                          );
                        })()}
                        {membersErrorFor === tripId && (
                          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mt-1">
                            {APP_MEMBERS_ERROR}{" "}
                            <button type="button" onClick={() => setMembersReload(n => n + 1)} className="underline underline-offset-2 hover:text-foreground">Try again</button>
                          </p>
                        )}
                      </div>
                      {tripTravelers.length > 2 && !bulkEmailMode && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => {
                            const init: Record<string, string> = {};
                            tripTravelers.forEach(t => { init[t.id] = t.email || ""; });
                            setBulkEmails(init);
                            setBulkEmailMode(true);
                          }}
                        >
                          <Envelope /> Edit emails
                        </Button>
                      )}
                    </div>

                    {/* Bulk email editor */}
                    {bulkEmailMode && tripTravelers.length > 0 && (
                      <div className="mb-6 rounded-xl bg-card border border-brand/30 overflow-hidden">
                        <div className="px-4 py-3 bg-brand/5 border-b border-brand/20 flex items-center justify-between">
                          <p className="text-xs font-medium text-brand">Bulk email</p>
                          <p className="text-[10px] font-bold text-muted-foreground">{tripTravelers.filter(t => bulkEmails[t.id]).length}/{tripTravelers.length} with email</p>
                        </div>
                        <div className="divide-y divide-slate-100 dark:divide-border">
                          {tripTravelers.map(t => (
                            <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                              <PersonAvatar avatar={t.avatar} initials={t.initials} name={t.name} className="h-8 w-8" fallbackClassName="bg-brand/10 text-brand text-[10px] font-black" />
                              <p className="text-xs font-bold text-foreground/80 w-32 sm:w-40 truncate shrink-0">{t.name}</p>
                              <Input
                                type="email"
                                value={bulkEmails[t.id] || ""}
                                onChange={e => setBulkEmails(prev => ({ ...prev, [t.id]: e.target.value }))}
                                placeholder="email@example.com"
                                className="flex-1"
                              />
                            </div>
                          ))}
                        </div>
                        <div className="px-4 py-3 border-t border-border flex items-center gap-2 justify-end">
                          <button onClick={() => setBulkEmailMode(false)} className="h-8 px-4 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
                            Cancel
                          </button>
                          <button
                            disabled={emailSaving}
                            onClick={async () => {
                              for (const t of tripTravelers) {
                                const newEmail = (bulkEmails[t.id] || "").trim();
                                if (newEmail !== (t.email || "")) {
                                  if (!await saveTravelerEmail(t.id, newEmail)) return;
                                }
                              }
                              setBulkEmailMode(false);
                              toast.success("Emails updated");
                            }}
                            className="h-8 px-5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                          >
                            Save All
                          </button>
                        </div>
                      </div>
                    )}

                    {tripTravelers.length > 0 ? (
                      <div className="space-y-2">
                        {tripTravelers.map(t => {
                          const eventCount = trip.events.filter(e => e.assignedTo?.includes(t.id)).length;
                          const isEditing = editingEmailId === t.id;
                          return (
                            <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border group hover:border-brand/30 transition-colors">
                              <PersonAvatar avatar={t.avatar} initials={t.initials} name={t.name} className="h-10 w-10" fallbackClassName="bg-brand/10 text-brand text-xs font-black" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                  <p className="text-sm font-bold text-foreground truncate">{t.name}</p>
                                  {memberByTraveler.has(t.id) ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                                      <DeviceMobile className="h-3 w-3" weight="bold" /> In the app{memberByTraveler.get(t.id)?.last_seen_at ? `, opened ${timeAgo(memberByTraveler.get(t.id)!.last_seen_at)}` : ""}
                                    </span>
                                  ) : membersLoaded ? (
                                    <span className="text-[10px] font-medium text-muted-foreground shrink-0">
                                      {(() => {
                                        const invited = trip.travelers?.find(tv => tv.id === t.id)?.invitedAt;
                                        return invited
                                          ? `Invited ${new Date(invited).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, not joined yet`
                                          : "Not joined yet";
                                      })()}
                                    </span>
                                  ) : null}
                                </div>
                                {isEditing ? (
                                  <form
                                    className="flex items-center gap-1.5 mt-1"
                                    onSubmit={async e => {
                                      e.preventDefault();
                                      if (emailSaving || !await saveTravelerEmail(t.id, editingEmailValue)) return;
                                      setEditingEmailId(null);
                                      toast.success("Email saved");
                                    }}
                                  >
                                    <Input
                                      autoFocus
                                      type="email"
                                      value={editingEmailValue}
                                      onChange={e => setEditingEmailValue(e.target.value)}
                                      onKeyDown={e => { if (e.key === "Escape") setEditingEmailId(null); }}
                                      placeholder="email@example.com"
                                      className="flex-1"
                                    />
                                    <button type="submit" className="h-7 w-7 rounded-md bg-brand flex items-center justify-center shrink-0">
                                      <Check className="h-3 w-3 text-black" weight="bold" />
                                    </button>
                                  </form>
                                ) : (
                                  <button
                                    onClick={() => { setEditingEmailId(t.id); setEditingEmailValue(t.email || ""); }}
                                    className="text-[10px] font-medium truncate mt-0.5 text-left block"
                                  >
                                    {t.email
                                      ? <span className="text-muted-foreground">{t.email}</span>
                                      : <span className="text-brand/50 hover:text-brand transition-colors">+ Add email</span>
                                    }
                                  </button>
                                )}
                                {/* They confirmed a different email in the app: offer it in one click */}
                                {!isEditing && memberByTraveler.get(t.id)?.email && memberByTraveler.get(t.id)!.email!.toLowerCase() !== (t.email || "").toLowerCase() ? (
                                  <button
                                    type="button"
                                    disabled={emailSaving} onClick={async () => { if (await saveTravelerEmail(t.id, memberByTraveler.get(t.id)!.email!)) toast.success("Email saved"); }}
                                    className="text-[10px] font-medium text-link hover:underline mt-0.5 text-left block truncate max-w-full"
                                  >
                                    Use {memberByTraveler.get(t.id)!.email} from the app
                                  </button>
                                ) : null}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {eventCount > 0 && (
                                  <span className="text-[11px] font-medium text-brand/60 hidden sm:inline">
                                    {eventCount} tagged
                                  </span>
                                )}
                                <button
                                  type="button"
                                  aria-label={`Remove ${t.name} from trip`}
                                  // Someone already using the app for this traveller gets a warning first
                                  onClick={() => (memberByTraveler.has(t.id) ? setRemoveTarget({ id: t.id, name: t.name }) : removeTravelerFromTrip(t))}
                                  className="h-8 w-8 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 bg-card border-2 border-dashed border-border rounded-xl text-muted-foreground">
                        <Users className="h-10 w-10 mb-3 opacity-20" />
                        <p className="text-xs font-medium">No travellers assigned yet</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Add travelers below to tag them on specific events</p>
                      </div>
                    )}
                  </div>

                  {/* In the app but not matched to anyone on the list: they see everyone's plan until linked */}
                  {unlistedMembers.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="text-sm font-semibold text-foreground">In the app, not on the list</h3>
                        <span className="text-[11px] font-medium text-muted-foreground">{unlistedMembers.length}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-4">They joined without picking a name, so they see everyone's plan. Link each one to a traveller to give them their own.</p>
                      <div className="space-y-2">
                        {unlistedMembers.map(m => {
                          const free = tripTravelers.filter(t => !memberByTraveler.has(t.id));
                          return (
                            <div key={m.keys[0]} className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
                              <div className="h-10 w-10 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground text-xs font-black uppercase shrink-0">
                                {(m.name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("")}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-foreground truncate">{m.name || "Unnamed traveller"}</p>
                                <p className="text-[10px] font-medium text-muted-foreground truncate">
                                  {m.email || "No email"}{m.joined_at ? `, joined ${new Date(m.joined_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                                </p>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  disabled={!free.length}
                                  className="h-8 px-3 rounded-lg border border-border bg-secondary text-xs font-medium text-foreground hover:border-brand/40 flex items-center gap-1.5 shrink-0 disabled:opacity-40"
                                >
                                  <LinkSimple className="h-3.5 w-3.5" weight="bold" /> {free.length ? "Link to traveller" : "Everyone's linked"}
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-56 bg-card border border-border shadow-2xl rounded-xl p-1 max-h-72 overflow-y-auto">
                                  {free.map(t => (
                                    <DropdownMenuItem
                                      key={t.id}
                                      className="rounded-lg text-xs"
                                      onClick={async () => {
                                        try {
                                          for (const deviceId of m.deviceIds) await setMemberTraveler(trip.id, deviceId, t.id);
                                          setMembersReload(n => n + 1);
                                          toast.success(`${m.name || "They"} now see ${t.name}'s plan`);
                                        } catch {
                                          toast.error("Couldn't link them. Only editors can do this.");
                                        }
                                      }}
                                    >
                                      {t.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuContent>
                              </DropdownMenu>
                              <button
                                type="button"
                                title="Remove from trip"
                                aria-label={`Remove ${m.name || "this traveller"} from the trip`}
                                onClick={() => setRemoveMemberTarget({ keys: m.keys, name: m.name || "This traveller" })}
                                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors shrink-0"
                              >
                                <X className="h-3.5 w-3.5" weight="bold" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Add Travelers */}
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold text-muted-foreground">Add travellers</h3>
                      <button
                        type="button"
                        onClick={() => setBulkAddOpen(true)}
                        className="h-7 px-2.5 rounded-lg border border-border bg-secondary text-xs font-medium text-foreground hover:border-brand/40 flex items-center gap-1.5"
                      >
                        <UserPlus className="h-3.5 w-3.5" /> Add many
                      </button>
                    </div>
                    <div className="relative mb-3">
                      <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={peopleSearch}
                        onChange={e => setPeopleSearch(e.target.value)}
                        placeholder="Search travelers..."
                        className="w-full pl-9"
                      />
                    </div>
                    {(() => {
                      const filtered = availableTravelers.filter(t =>
                        !peopleSearch || t.name.toLowerCase().includes(peopleSearch.toLowerCase()) || t.email.toLowerCase().includes(peopleSearch.toLowerCase())
                      );
                      return filtered.length > 0 ? (
                        <div className="space-y-1.5">
                          {filtered.map(t => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => {
                                const newIds = [...(trip.travelerIds || []), t.id];
                                const newTravelers = [...(trip.travelers || []), tripTravelerOf(t)];
                                updateTrip(trip.id, { travelerIds: newIds, travelers: newTravelers });
                                toast.success(`Added ${t.name} to trip`);
                              }}
                              className="w-full flex items-center gap-3 p-3 rounded-xl bg-background border border-border hover:border-brand/30 hover:bg-brand/5 transition-all group text-left"
                            >
                              <PersonAvatar avatar={t.avatar} initials={t.initials} name={t.name} className="h-9 w-9" fallbackClassName="text-[10px] font-black group-hover:bg-brand/10 group-hover:text-brand transition-colors" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-foreground/80 truncate group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{t.name}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{t.email || <span className="italic text-muted-foreground">No email</span>}</p>
                              </div>
                              <Plus className="h-4 w-4 text-muted-foreground group-hover:text-brand transition-colors shrink-0" />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-muted-foreground">
                          <p className="text-xs font-medium">{allTravelers.length === 0 ? "No travelers yet" : "All travelers are assigned"}</p>
                        </div>
                      );
                    })()}

                    {/* Quick add traveler inline */}
                    <div className="mt-4 pt-4 border-t border-border">
                      <p className="text-xs font-medium text-muted-foreground mb-3">Quick add</p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = e.currentTarget;
                          const nameVal = (form.elements.namedItem("qname") as HTMLInputElement).value.trim();
                          const emailVal = (form.elements.namedItem("qemail") as HTMLInputElement).value.trim();
                          if (!nameVal) return;
                          const id = `custom-${Date.now()}`;
                          const initials = nameVal.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
                          const newUser: UserType = { id, name: nameVal, email: emailVal, role: "Traveler", avatar: "", initials, status: "Active" };
                          setCustomTravelers(prev => [...prev, newUser]);
                          const newIds = [...(trip.travelerIds || []), id];
                          const newTravelers = [...(trip.travelers || []), { id, name: nameVal, initials, ...(emailVal ? { email: emailVal } : {}) }];
                          updateTrip(trip.id, { travelerIds: newIds, travelers: newTravelers });
                          toast.success(`Added ${nameVal} to trip`);
                          form.reset();
                        }}
                        className="space-y-2"
                      >
                        <Input name="qname" required placeholder="Name" className="w-full font-bold" />
                        <Input name="qemail" type="email" placeholder="Email (links their app account)" className="w-full font-bold" />
                        <button type="submit" className="w-full h-9 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
                          <UserPlus className="h-3.5 w-3.5" /> Add to Trip
                        </button>
                      </form>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>

          {showMap && (
            <aside className="absolute inset-0 lg:relative lg:inset-auto w-full lg:w-[40%] h-full border-l-0 lg:border-l border-border bg-card animate-in slide-in-from-right duration-500 z-40 overflow-hidden shadow-2xl flex flex-col">
              {/* Mobile header bar */}
              <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/95/95 backdrop-blur-sm shrink-0 z-50">
                <div className="flex items-center gap-2.5">
                  <MapIcon className="h-4 w-4 text-brand" />
                  <span className="text-xs font-medium text-foreground">Route map</span>
                </div>
                <button
                  onClick={() => setShowMap(false)}
                  className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform"
                  aria-label="Close map"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <div className="flex-1 min-h-0">
                <TripMap theme={theme} trip={trip} />
              </div>
            </aside>
          )}
          {showTasks && (
            <aside className="absolute inset-0 lg:relative lg:inset-auto w-full lg:w-[40%] h-full border-l-0 lg:border-l border-border bg-card animate-in slide-in-from-right duration-500 z-40 overflow-hidden shadow-2xl flex flex-col">
              <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/95/95 backdrop-blur-sm shrink-0 z-50">
                <div className="flex items-center gap-2.5">
                  <ListChecks className="h-4 w-4 text-brand" />
                  <span className="text-xs font-medium text-foreground">Tasks</span>
                </div>
                <button
                  onClick={() => setShowTasks(false)}
                  className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform"
                  aria-label="Close tasks"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <TaskChecklist
                tasks={trip.tasks ?? []}
                onUpdate={(tasks) => updateTrip(trip.id, { tasks })}
                travelers={trip.travelers}
              />
            </aside>
          )}
          {showCosts && (
            <aside className="absolute inset-0 lg:relative lg:inset-auto w-full lg:w-[40%] h-full border-l-0 lg:border-l border-border bg-card animate-in slide-in-from-right duration-500 z-40 overflow-hidden shadow-2xl flex flex-col">
              <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/95/95 backdrop-blur-sm shrink-0 z-50">
                <div className="flex items-center gap-2.5">
                  <Wallet className="h-4 w-4 text-brand" />
                  <span className="text-xs font-medium text-foreground">Costs</span>
                </div>
                <button
                  onClick={() => setShowCosts(false)}
                  className="h-8 w-8 rounded-lg bg-secondary border border-border flex items-center justify-center active:scale-95 transition-transform"
                  aria-label="Close costs"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              </div>
              <CostSummary trip={trip} onOpenEvent={handleEditEvent} onEditBudget={handleOpenEditTrip} />
            </aside>
          )}
          {showMobilePreview && (
            <aside
              className={`absolute inset-0 lg:relative lg:inset-auto w-full h-full border-l-0 lg:border-l border-border bg-card animate-in slide-in-from-right duration-500 z-40 overflow-hidden shadow-2xl flex flex-col ${previewWidth ? "lg:w-(--preview-w) lg:shrink-0" : "lg:w-[40%]"}`}
              style={previewWidth ? ({ "--preview-w": `${previewWidth}px` } as React.CSSProperties) : undefined}
            >
              {/* Drag to resize the panel; double-click puts it back */}
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize phone preview"
                title="Drag to resize. Double-click to reset."
                onPointerDown={startPreviewResize}
                onDoubleClick={() => { setPreviewWidth(null); try { localStorage.removeItem("daf-preview-width"); } catch { /* private mode */ } }}
                className="hidden lg:block absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 z-10 cursor-col-resize hover:bg-border active:bg-foreground/20 transition-colors"
              />
              <MobilePreview
                trip={trip}
                events={groupedEvents.flatMap(([, evs]) => evs)}
                activeEventId={isEditPanelOpen && editingEvent ? editingEvent.id : null}
                viewAsName={viewAsTraveler?.name ?? null}
                onClose={() => setShowMobilePreview(false)}
              />
            </aside>
          )}
          {showAssistant && !isViewer && (
            <aside className="absolute inset-0 lg:relative lg:inset-auto w-full lg:w-[40%] h-full border-l-0 lg:border-l border-border bg-card animate-in slide-in-from-right duration-500 z-40 overflow-hidden shadow-2xl flex flex-col">
              <ItineraryAssistant
                key={trip.id}
                trip={trip}
                onUpdateEvents={(events) => updateTrip(trip.id, { events })}
                onUpdateInfo={(info) => updateTrip(trip.id, { info })}
                onClose={() => setShowAssistant(false)}
                guard={demoGate}
              />
            </aside>
          )}
        </div>
      </div>

      {/* Event Edit Dialog - full screen */}
      <ConfirmDialog
        open={!!confirmClearInfo}
        onOpenChange={open => { if (!open) setConfirmClearInfo(null); }}
        title={clearing.length === 1 && clearing[0].startsWith("the organiser") ? "Remove the organiser?" : clearing.length > 1 ? "Remove these from the trip?" : "Remove all information?"}
        description={`Saving removes ${clearing.join(" and ")} from this trip. Travellers lose ${clearing.length > 1 || !clearing[0]?.startsWith("the organiser") ? "them" : "it"} the next time you publish.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { await confirmClearInfo?.(); setConfirmClearInfo(null); }}
      />
      <ConfirmDialog
        open={discardPromptOpen}
        onOpenChange={setDiscardPromptOpen}
        title="Discard changes?"
        description="You have unsaved changes on this event. Close without saving?"
        confirmLabel="Discard"
        destructive
        onConfirm={discardEventChanges}
      />
      <Dialog open={isEditPanelOpen} onOpenChange={handleEventDialogOpenChange}>
        {/* Opening focuses the title, not the first status pill (whose focus ring read as a selection) */}
        <DialogContent initialFocus={() => document.getElementById("event-title")} className="max-w-2xl w-[95vw] p-0 bg-card border border-border shadow-2xl rounded-xl overflow-hidden flex flex-col max-h-[95vh] sm:max-h-[90vh]">
          <form onSubmit={handleSaveEvent} className="flex flex-col h-full min-h-0">
            {/* Header */}
            <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shrink-0">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {editingEvent?.title ? "Edit event" : "New event"}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">Anything left blank can be filled in later.</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
                {(["Proposed", "Confirmed", "Cancelled"] as const).map(s => (
                  <button key={s} type="button"
                    onClick={() => setEditingEvent(prev => prev ? { ...prev, status: s } : null)}
                    className={`px-3 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
                      editingEvent?.status === s
                        ? s === "Confirmed" ? "bg-emerald-400 text-black shadow-lg shadow-emerald-400/20"
                          : s === "Cancelled" ? "bg-red-500 text-white shadow-lg shadow-red-500/20"
                          : "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:bg-slate-200 dark:hover:bg-secondary"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Body - one column, essentials open and the rest behind sections */}
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
              <div>
                {/* Category tabs */}
                <div className="flex flex-wrap gap-2 px-4 sm:px-6 pt-4 pb-1">
                  {([
                    { id: "flight", label: "Flight", icon: AirplaneTilt },
                    { id: "hotel", label: "Hotel", icon: Bed },
                    { id: "activity", label: "Activity", icon: Compass },
                    { id: "dining", label: "Dining", icon: ForkKnife },
                    { id: "transfer", label: "Transfer", icon: Car },
                  ] as const).map(cat => (
                    <button key={cat.id} type="button" onClick={() => setEditingEvent(prev => prev ? { ...prev, type: cat.id } : null)}
                      aria-pressed={editingEvent?.type === cat.id}
                      className={`flex items-center gap-2 h-9 pl-1.5 pr-3 rounded-lg border transition-colors ${editingEvent?.type === cat.id ? "border-foreground/30 bg-secondary text-foreground" : "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground"}`}>
                      <CategoryDot type={cat.id} size="sm" />
                      <span className="text-sm font-medium">{cat.label}</span>
                    </button>
                  ))}
                </div>

                {/* Live search - flight */}
                {editingEvent?.type === "flight" && (
                  <FlightSearch
                    onSelect={(data) => setEditingEvent(prev => prev ? { ...prev, ...data, title: prev.title || data.title || "" } : null)}
                    defaultDate={editingEvent?.date}
                  />
                )}

                {/* Live search - hotel */}
                {editingEvent?.type === "hotel" && (
                  <HotelSearch
                    onSelect={({ checkin: ci, checkout: co, notes, ...data }) => { setEditingEvent(prev => {
                      if (!prev) return null;
                      // Never clobber what the agent already typed (title, notes, dates)
                      return { ...prev, ...data, title: prev.title || data.title || "", notes: prev.notes || notes, checkin: prev.checkin || ci || "", checkout: prev.checkout || co || "" };
                    }); }}
                    defaultCheckin={trip.start}
                    defaultCheckout={trip.end}
                  />
                )}

                {/* Live search - activity */}
                {editingEvent?.type === "activity" && (
                  <ActivitySearch
                    onSelect={({ notes, ...data }) => setEditingEvent(prev => prev ? { ...prev, ...data, title: prev.title || data.title || "", notes: prev.notes || notes } : null)}
                  />
                )}

                {/* Live search - dining */}
                {editingEvent?.type === "dining" && (
                  <DiningSearch
                    onSelect={({ notes, ...data }) => setEditingEvent(prev => prev ? { ...prev, ...data, title: prev.title || data.title || "", notes: prev.notes || notes } : null)}
                  />
                )}

                <div className="px-4 sm:px-6 pt-4 pb-1">
                  <span className="text-sm font-semibold text-foreground">Essentials</span>
                </div>
                <div className="px-4 sm:px-6 pb-5 pt-1 space-y-5">
                  {/* Title - large underline style */}
                  <div className="space-y-1">
                    <Label htmlFor="event-title" className="text-xs font-medium text-muted-foreground">Event title</Label>
                    <Input
                      id="event-title"
                      value={editingEvent?.title || ""}
                      onChange={e => { setEditingEvent(prev => prev ? { ...prev, title: e.target.value } : null); if (eventErrors.title) setEventErrors(prev => ({ ...prev, title: undefined })); }}
                      placeholder="What's happening? e.g. Transfer to hotel"
                      aria-invalid={!!eventErrors.title}
                      className="w-full h-11 text-lg font-semibold tracking-tight bg-background border-border rounded-lg focus-visible:border-brand focus-visible:ring-0"
                    />
                    {eventErrors.title && <p className="text-[11px] font-semibold text-red-500">{eventErrors.title}</p>}
                  </div>

                  {/* Date + Time */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Date</Label>
                      <Popover>
                        <PopoverTrigger className={cn(
                          "w-full h-10 flex items-center gap-2 px-3 rounded-lg text-sm font-semibold bg-background border border-border hover:border-brand/50 transition-colors text-left",
                          editingEvent?.date ? "text-foreground" : "text-muted-foreground"
                        )}>
                          <CalendarDots className="h-3.5 w-3.5 text-brand shrink-0" />
                          <span className="text-sm">{editingEvent?.date ? format(parseISO(editingEvent.date), "MMM d, yyyy") : "Pick a date..."}</span>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 border border-border shadow-2xl rounded-xl bg-card" align="start">
                          <Calendar mode="single" selected={editingEvent?.date ? parseISO(editingEvent.date) : undefined}
                            onSelect={(day) => { if (!day) return; setEventErrors(prev => ({ ...prev, date: undefined })); setEditingEvent(prev => {
                              if (!prev) return null;
                              const formatted = format(day, "yyyy-MM-dd");
                              const updates: Partial<TravelEvent> = { date: formatted };
                              if (prev.type === "hotel") updates.checkin = formatted;
                              return { ...prev, ...updates };
                            }); }} initialFocus />
                        </PopoverContent>
                      </Popover>
                      {eventErrors.date && <p className="text-[11px] font-semibold text-red-500">{eventErrors.date}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">{editingEvent?.type === "hotel" && !editingEvent?.isOvernight ? "Check-in time" : "Start time"}</Label>
                      <Input value={editingEvent?.time || ""} onChange={e => { setEditingEvent(prev => prev ? { ...prev, time: e.target.value } : null); if (eventErrors.time) setEventErrors(prev => ({ ...prev, time: undefined })); }} onBlur={e => { const f = formatTimeInput(e.target.value); if (f !== e.target.value) setEditingEvent(prev => prev ? { ...prev, time: f } : null); setEventErrors(prev => ({ ...prev, time: isValidTimeInput(e.target.value) ? undefined : TIME_INPUT_ERROR })); }} placeholder={editingEvent?.type === "hotel" && !editingEvent?.isOvernight ? "15:00" : "10:30"} aria-invalid={!!eventErrors.time} className={`h-10 text-sm font-semibold bg-background text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors ${eventErrors.time ? "border-red-500" : "border-border"}`} />
                      <p className="text-[11px] text-muted-foreground">Leave blank if the time is not confirmed.</p>
                      {eventErrors.time && <p className="text-[11px] font-semibold text-red-500">{eventErrors.time}</p>}
                    </div>
                  </div>

                  {/* Overnight toggle for hotel */}
                  {editingEvent?.type === "hotel" && (
                    <button
                      type="button"
                      onClick={() => setEditingEvent(prev => prev ? { ...prev, isOvernight: !prev.isOvernight } : null)}
                      className="flex items-center gap-2.5 group/toggle"
                    >
                      <div className={cn(
                        "h-5 w-9 rounded-full relative transition-colors duration-200",
                        editingEvent.isOvernight ? "bg-brand" : "bg-secondary"
                      )}>
                        <div className={cn(
                          "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200",
                          editingEvent.isOvernight ? "translate-x-4" : "translate-x-0.5"
                        )} />
                      </div>
                      <Moon className={cn("h-3.5 w-3.5 transition-colors", editingEvent.isOvernight ? "text-brand" : "text-muted-foreground")} />
                      <span className="text-xs font-medium text-muted-foreground">Overnight</span>
                    </button>
                  )}

                  {/* Transfer type selector */}
                  {editingEvent?.type === "transfer" && (
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Transport type</label>
                      <div className="flex gap-2">
                        {([
                          { value: "car", label: "Car", Icon: Car },
                          { value: "train", label: "Train", Icon: Train },
                          { value: "bus", label: "Bus", Icon: Bus },
                          { value: "ferry", label: "Ferry", Icon: Boat },
                          { value: "cruise", label: "Cruise", Icon: Anchor },
                          { value: "other", label: "Other", Icon: Compass },
                        ] as const).map(({ value, label, Icon }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setEditingEvent(prev => prev ? { ...prev, transferType: value } : null)}
                            className={cn(
                              "flex flex-col items-center gap-1 px-3 py-2 rounded-xl border text-xs font-medium transition-all",
                              (editingEvent.transferType || "car") === value
                                ? "border-brand bg-brand/10 text-brand"
                                : "border-border text-muted-foreground hover:border-brand/30 hover:text-brand/70"
                            )}
                          >
                            <Icon className="h-4 w-4" />
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Who meets them and where: travellers see these on the phone and in arrival mode */}
                  {editingEvent?.type === "transfer" && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Meeting point</Label>
                        <Input value={editingEvent?.meetingPoint || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, meetingPoint: e.target.value } : null)} placeholder="e.g., Exit B, Arrivals hall" className="h-10 text-sm font-semibold bg-background border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Driver or guide</Label>
                          <Input value={editingEvent?.contactName || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, contactName: e.target.value } : null)} placeholder="e.g., Somchai" className="h-10 text-sm font-semibold bg-background border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">Their phone</Label>
                          <Input type="tel" value={editingEvent?.contactPhone || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, contactPhone: e.target.value } : null)} placeholder="e.g., +66 81 234 5678" className="h-10 text-sm font-semibold bg-background border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Travellers see these in the app, unlike notes and supplier.</p>
                    </div>
                  )}

                  {/* Check-out Time for hotel (non-overnight) */}
                  {editingEvent?.type === "hotel" && !editingEvent?.isOvernight && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Check-out time</Label>
                        <Input value={editingEvent?.endTime || ""} onChange={e => { setEditingEvent(prev => prev ? { ...prev, endTime: e.target.value } : null); setEventErrors(prev => ({ ...prev, endTime: undefined })); }} onBlur={e => { const f = formatTimeInput(e.target.value); if (f !== e.target.value) setEditingEvent(prev => prev ? { ...prev, endTime: f } : null); setEventErrors(prev => ({ ...prev, endTime: isValidTimeInput(e.target.value) ? undefined : TIME_INPUT_ERROR })); }} placeholder="11:00" aria-invalid={!!eventErrors.endTime} className="h-10 text-sm font-semibold bg-background border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                        <p className="text-[11px] text-muted-foreground">Leave blank if not confirmed.</p>
                        {eventErrors.endTime && <p className="text-[11px] font-semibold text-red-500">{eventErrors.endTime}</p>}
                      </div>
                    </div>
                  )}

                  {/* End Time + Duration for activity/dining */}
                  {(editingEvent?.type === "activity" || editingEvent?.type === "dining" || editingEvent?.type === "transfer") && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">End time</Label>
                        <Input value={editingEvent?.endTime || ""} onChange={e => { setEditingEvent(prev => prev ? { ...prev, endTime: e.target.value } : null); setEventErrors(prev => ({ ...prev, endTime: undefined })); }} onBlur={e => { const f = formatTimeInput(e.target.value); if (f !== e.target.value) setEditingEvent(prev => prev ? { ...prev, endTime: f } : null); setEventErrors(prev => ({ ...prev, endTime: isValidTimeInput(e.target.value) ? undefined : TIME_INPUT_ERROR })); }} placeholder="14:00" aria-invalid={!!eventErrors.endTime} className="h-10 text-sm font-semibold bg-background border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                        {(() => {
                          // A same-day end before the start is almost always a typo or a misread document
                          const start = parseTimeInput(editingEvent?.time), end = parseTimeInput(editingEvent?.endTime);
                          return start && end && end < start
                            ? <p className="text-[11px] text-amber-600 dark:text-amber-400">Ends before it starts ({start}). Check the times.</p>
                            : <p className="text-[11px] text-muted-foreground">Leave blank if not confirmed.</p>;
                        })()}
                        {eventErrors.endTime && <p className="text-[11px] font-semibold text-red-500">{eventErrors.endTime}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium text-muted-foreground">Duration</Label>
                        <Input value={editingEvent?.duration || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, duration: e.target.value } : null)} placeholder="e.g., 3h 30m" className="h-10 text-sm font-semibold bg-background border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                      </div>
                    </div>
                  )}

                  {/* Location - with Mapbox autocomplete */}
                  <div className="space-y-1.5">
                    <label htmlFor="event-location" className="text-xs font-medium text-muted-foreground">Location or address</label>
                    <LocationAutocomplete
                      id="event-location"
                      ariaLabel="Location"
                      destination={trip?.destination}
                      value={editingEvent?.location || ""}
                      onChange={(val, coords) => setEditingEvent(prev => prev ? { ...prev, location: val, locationCoords: coords ?? prev.locationCoords } : null)}
                      placeholder="Search for a place..."
                      className="h-10 w-full text-sm font-semibold bg-background border border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 focus-visible:outline-none transition-colors"
                    />
                  </div>

                </div>

                {/* ── Details: everything optional, collapsed by default ── */}
                <Collapsible className="border-t border-border">
                  <CollapsibleTrigger className="w-full flex items-center justify-between px-4 sm:px-6 py-3.5 text-left hover:bg-secondary transition-colors group/sec">
                    <span className="text-sm font-semibold text-foreground">Details</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground">
                        {[editingEvent?.supplier, editingEvent?.confNumber, editingEvent?.price].filter(Boolean).length || "Optional"}
                        {[editingEvent?.supplier, editingEvent?.confNumber, editingEvent?.price].filter(Boolean).length ? " set" : ""}
                      </span>
                      <CaretDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[panel-open]/sec:rotate-180" />
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="p-4 sm:p-6 pt-1 space-y-5">
                  {/* Supplier + Conf# */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Supplier</Label>
                      <Input list="known-suppliers" value={editingEvent?.supplier || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, supplier: e.target.value } : null)} placeholder="e.g., Qatar Airways" className="h-10 text-sm font-semibold bg-background border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                      <datalist id="known-suppliers">
                        {knownSuppliers.map(name => <option key={name} value={name} />)}
                      </datalist>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Confirmation number</Label>
                      <Input value={editingEvent?.confNumber || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, confNumber: e.target.value } : null)} placeholder="e.g., ABC-12345" className="h-10 text-sm font-semibold bg-background border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                    </div>
                  </div>

                  {/* Price */}
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Price</Label>
                    <Input value={editingEvent?.price || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, price: e.target.value } : null)} placeholder="e.g., 1,200 per person" className="h-10 text-sm font-semibold bg-background border-border text-foreground rounded-lg hover:border-brand/50 focus-visible:border-brand focus-visible:ring-0 transition-colors" />
                  </div>

                  {/* Type-specific fields */}
                  {(editingEvent?.type === "flight" || editingEvent?.type === "hotel") && (
                    <div className="space-y-4 pt-1">
                      <div className="flex items-center gap-3">
                        <div className="h-px flex-1 bg-secondary" />
                        <span className="text-xs font-medium text-muted-foreground">
                          {editingEvent.type === "flight" ? "Flight Details" : "Hotel Details"}
                        </span>
                        <div className="h-px flex-1 bg-secondary" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {editingEvent.type === "flight" ? (
                          <>
                            {[
                              { key: "airline", label: "Airline" }, { key: "flightNum", label: "Flight No." },
                              { key: "terminal", label: "Dep Terminal" }, { key: "arrTerminal", label: "Arr Terminal" },
                              { key: "gate", label: "Gate" },
                            ].map(f => (
                              <div key={f.key} className="space-y-1.5">
                                <Label className="text-xs font-medium text-muted-foreground">{f.label}</Label>
                                <Input value={((editingEvent as unknown as Record<string, string | undefined>)[f.key] ?? "") || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, [f.key]: e.target.value } : null)} className="h-10 text-sm bg-background border-border text-foreground rounded-lg focus-visible:border-brand focus-visible:ring-0" />
                              </div>
                            ))}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium text-muted-foreground">Arrival time</Label>
                              <Input value={editingEvent?.endTime || ""} onChange={e => { setEditingEvent(prev => prev ? { ...prev, endTime: e.target.value } : null); setEventErrors(prev => ({ ...prev, endTime: undefined })); }} onBlur={e => { const f = formatTimeInput(e.target.value); if (f !== e.target.value) setEditingEvent(prev => prev ? { ...prev, endTime: f } : null); setEventErrors(prev => ({ ...prev, endTime: isValidTimeInput(e.target.value) ? undefined : TIME_INPUT_ERROR })); }} placeholder="e.g., 14:30" aria-invalid={!!eventErrors.endTime} className="h-10 text-sm bg-background border-border text-foreground rounded-lg focus-visible:border-brand focus-visible:ring-0" />
                              <p className="text-[11px] text-muted-foreground">Leave blank if not confirmed.</p>
                              {eventErrors.endTime && <p className="text-[11px] font-semibold text-red-500">{eventErrors.endTime}</p>}
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium text-muted-foreground">Duration</Label>
                              <Input value={editingEvent?.duration || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, duration: e.target.value } : null)} placeholder="e.g., 3h 30m" className="h-10 text-sm bg-background border-border text-foreground rounded-lg focus-visible:border-brand focus-visible:ring-0" />
                            </div>
                            <div className="col-span-2 space-y-1.5">
                              <Label className="text-xs font-medium text-muted-foreground">Seat or ticket details</Label>
                              <Input value={editingEvent?.seatDetails || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, seatDetails: e.target.value } : null)} placeholder="e.g., 14A, 14B - Business Class" className="h-10 text-sm bg-background border-border text-foreground rounded-lg focus-visible:border-brand focus-visible:ring-0" />
                            </div>
                          </>
                        ) : (
                          <>
                            {[{ key: "checkin", label: "Check-in" }, { key: "checkout", label: "Check-out" }].map(f => {
                              const val = ((editingEvent as unknown as Record<string, string | undefined>)[f.key] ?? "") || "";
                              const parsed = val ? (() => { try { return parseISO(val); } catch { return null; } })() : null;
                              const isValid = parsed && !isNaN(parsed.getTime());
                              return (
                                <div key={f.key} className="space-y-1.5">
                                  <label className="text-xs font-medium text-muted-foreground">{f.label}</label>
                                  <Popover>
                                    <PopoverTrigger className={cn(
                                      "w-full h-9 flex items-center gap-2 px-3 rounded-lg text-sm bg-background border border-border hover:border-brand/50 transition-colors text-left",
                                      isValid ? "text-foreground font-semibold" : "text-muted-foreground"
                                    )}>
                                      <CalendarDots className="h-3.5 w-3.5 text-brand shrink-0" />
                                      <span className="text-sm truncate">{isValid ? format(parsed!, "MMM d, yyyy") : "Pick a date..."}</span>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0 border border-border shadow-2xl rounded-xl bg-card" align="start">
                                      <Calendar mode="single" selected={isValid ? parsed! : undefined}
                                        onSelect={(day) => day && setEditingEvent(prev => {
                                          if (!prev) return null;
                                          const formatted = format(day, "yyyy-MM-dd");
                                          const updates: Partial<TravelEvent> = { [f.key]: formatted };
                                          if (f.key === "checkin") updates.date = formatted;
                                          return { ...prev, ...updates };
                                        })} initialFocus />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                              );
                            })}
                            <div className="space-y-1.5">
                              <Label className="text-xs font-medium text-muted-foreground">Room type</Label>
                              <Input value={editingEvent?.roomType || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, roomType: e.target.value } : null)} className="h-10 text-sm bg-background border-border text-foreground rounded-lg focus-visible:border-brand focus-visible:ring-0" />
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>

              {/* ── Media: image, photos and documents, collapsed by default ── */}
              <Collapsible className="border-t border-border">
                <CollapsibleTrigger className="w-full flex items-center justify-between px-4 sm:px-6 py-3.5 text-left hover:bg-secondary transition-colors group/sec">
                  <span className="text-sm font-semibold text-foreground">Media &amp; documents</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {(() => {
                        const n = (editingEvent?.media?.length ?? 0) + (editingEvent?.documents?.length ?? 0) + (editingEvent?.image ? 1 : 0);
                        return n === 0 ? "None" : `${n} attached`;
                      })()}
                    </span>
                    <CaretDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[panel-open]/sec:rotate-180" />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
              <div className="flex flex-col bg-slate-50/40 dark:bg-background">
                {/* Search bar */}
                <div className="p-3 sm:p-4 border-b border-border shrink-0 bg-card">
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={imageSearch}
                        onChange={e => setImageSearch(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runImageSearch(imageSearch); } }}
                        placeholder="Search images..."
                        className="w-full pl-9"
                      />
                    </div>
                    <button type="button" onClick={() => runImageSearch(imageSearch)}
                      className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity shrink-0 flex items-center gap-1">
                      {isSearchingImages ? <SpinnerGap className="h-3 w-3 animate-spin" /> : <MagnifyingGlass className="h-3 w-3" />}
                    </button>
                    {imageSearch && (
                      <button type="button" onClick={() => { setImageSearch(""); setImageResults([]); setImageSearchSource(null); }}
                        className="h-9 w-9 rounded-lg bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-2">
                    {(["auto", "google", "unsplash", "pexels"] as const).map(s => (
                      <button key={s} type="button" onClick={() => { setPreferredImageSource(s); if (imageLastQuery) runImageSearch(imageLastQuery, 1, s); }}
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${preferredImageSource === s ? "bg-brand/15 text-brand" : "text-muted-foreground hover:text-slate-600 dark:hover:text-muted-foreground"}`}>
                        {s === "auto" ? "Auto" : s === "google" ? "Google" : s === "unsplash" ? "Unsplash" : "Pexels"}
                      </button>
                    ))}
                  </div>
                  {imageIsAuto && (
                    <p className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                      <MagicWand className="h-3 w-3 text-brand" /> Auto-matching from title
                    </p>
                  )}
                </div>

                {/* Selected image preview */}
                <div className="relative h-28 sm:h-44 shrink-0 bg-secondary dark:bg-card overflow-hidden">
                  {editingEvent?.image ? (
                    <FocalPointPicker src={editingEvent.image} alt={editingEvent.title ? `Selected image for ${editingEvent.title}` : "Selected event image"} value={editingEvent.imagePosition}
                      onChange={imagePosition => setEditingEvent(prev => prev ? { ...prev, imagePosition } : null)} className="absolute inset-0">
                      <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />
                      <div className="absolute bottom-2 sm:bottom-3 left-3 right-3">
                        {editingEvent.title && <p className="text-white font-extrabold uppercase text-xs sm:text-base leading-tight drop-shadow-lg line-clamp-1 sm:line-clamp-2">{editingEvent.title}</p>}
                      </div>
                      <div className="absolute top-2 right-2 flex items-center gap-1.5">
                        {imageIsAuto && (
                          <div className="flex items-center gap-1 bg-primary text-primary-foreground text-[11px] font-medium px-2 py-0.5 rounded-lg">
                            <MagicWand className="h-2.5 w-2.5" /> Auto
                          </div>
                        )}
                        <button type="button" onClick={() => { setEditingEvent(prev => prev ? { ...prev, image: "" } : null); setImageIsAuto(false); }}
                          className="h-6 w-6 rounded-full bg-black/60 hover:bg-red-500/80 flex items-center justify-center text-white transition-colors" title="Remove image">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </FocalPointPicker>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center gap-2 text-center">
                      <Camera className="h-7 w-7 text-muted-foreground" />
                      <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">No image selected</p>
                    </div>
                  )}
                </div>

                {/* Scrollable area: results + media + docs + people + notes */}
                <div className="flex-1 overflow-y-auto min-h-0">
                {/* Results grid */}
                <div className="p-3">
                  {isSearchingImages ? (
                    <div className="flex items-center justify-center h-24 gap-2 text-muted-foreground">
                      <SpinnerGap className="h-4 w-4 animate-spin text-brand" />
                      <span className="text-xs font-medium">Searching...</span>
                    </div>
                  ) : imageResults.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {imageResults.map((url, i) => (
                          <button key={i} type="button"
                            onClick={() => { setEditingEvent(prev => prev ? { ...prev, image: url, imagePosition: undefined } : null); setImageIsAuto(false); }}
                            className={`relative h-[72px] rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02] ${editingEvent?.image === url ? "border-brand shadow-lg shadow-brand/30 scale-[1.02]" : "border-transparent hover:border-brand/50"}`}>
                            <img src={url} alt={`Image option ${i + 1}${imageSearch ? ` for ${imageSearch}` : ""}`} className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                          </button>
                        ))}
                      </div>
                      {(imageSearchSource === "google" || imageSearchSource === "unsplash" || imageSearchSource === "pexels") && imageLastQuery && (
                        <div className="flex items-center gap-1.5 pt-1">
                          <button type="button" onClick={() => runImageSearch(imageLastQuery, imagePage)}
                            className="flex-1 h-7 rounded-lg bg-secondary border border-border text-xs font-medium text-muted-foreground hover:text-brand hover:border-brand/40 transition-colors flex items-center justify-center gap-1">
                            <ArrowsClockwise className="h-3 w-3" /> Refresh
                          </button>
                          <button type="button" onClick={() => runImageSearch(imageLastQuery, imagePage + 1)}
                            className="flex-1 h-7 rounded-lg bg-brand/10 border border-brand/40 text-xs font-medium text-brand hover:bg-brand/20 transition-colors flex items-center justify-center gap-1">
                            Next <CaretRight className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {imageSearchSource === "local" && (
                        <p className="text-[9px] text-muted-foreground/70 font-medium text-center pt-1">
                          Suggested images · APIs unavailable
                        </p>
                      )}
                      {imageSearchSource === "google" && (
                        <p className="text-[9px] text-brand/60 font-medium text-center pt-1">
                          Google Image Search
                        </p>
                      )}
                      {imageSearchSource === "unsplash" && (
                        <p className="text-[9px] text-muted-foreground/70 font-medium text-center pt-1">
                          Unsplash
                        </p>
                      )}
                      {imageSearchSource === "pexels" && (
                        <p className="text-[9px] text-muted-foreground/70 font-medium text-center pt-1">
                          Pexels
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-20 gap-1.5 text-center">
                      <MagnifyingGlass className="h-5 w-5 text-muted-foreground" />
                      <p className="text-[10px] text-muted-foreground font-medium">Type to search images</p>
                    </div>
                  )}
                </div>

                {/* Media Upload */}
                <div className="p-3 sm:p-4 border-t border-border bg-card space-y-2 sm:space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Photos & Videos</label>
                    <button type="button" onClick={() => mediaInputRef.current?.click()}
                      className="h-7 px-3 rounded-lg bg-brand/10 border border-brand/20 text-brand text-xs font-medium cursor-pointer hover:bg-brand/20 transition-colors flex items-center gap-1.5">
                      <Upload className="h-3 w-3" /> Upload
                    </button>
                    <input ref={mediaInputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleMediaUpload} />
                  </div>
                  {(editingEvent?.media?.length ?? 0) > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {editingEvent!.media!.map((m, i) => (
                        <div key={i} className="relative group">
                          {m.type === "image" ? (
                            <button type="button" onClick={() => { setEditingEvent(prev => prev ? { ...prev, image: m.url, imagePosition: undefined } : null); setImageIsAuto(false); }}
                              className={`block w-full h-14 rounded-lg overflow-hidden border-2 transition-all hover:scale-[1.02] ${editingEvent?.image === m.url ? "border-brand shadow-lg shadow-brand/30 scale-[1.02]" : "border-border hover:border-brand/50"}`}>
                              <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                            </button>
                          ) : (
                            <div className="h-14 w-full bg-secondary rounded-lg border border-border flex flex-col items-center justify-center gap-0.5 px-1">
                              <Video className="h-4 w-4 text-brand" />
                              <span className="text-[8px] text-muted-foreground font-bold truncate w-full text-center leading-none">{m.name.replace(/\.[^.]+$/, "")}</span>
                            </div>
                          )}
                          <button type="button" onClick={() => handleRemoveMedia(i)}
                            className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white hidden group-hover:flex items-center justify-center shadow-sm">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <button type="button" onClick={() => mediaInputRef.current?.click()}
                      className="w-full h-10 rounded-lg border-2 border-dashed border-border flex items-center justify-center gap-2 text-muted-foreground hover:border-brand/50 hover:text-brand transition-colors group">
                      <ImageIcon2 className="h-4 w-4" />
                      <span className="text-xs font-medium">Add photos or videos</span>
                    </button>
                  )}
                </div>

                {/* Documents / Vouchers */}
                <div className="p-3 sm:p-4 border-t border-border bg-card space-y-2 sm:space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">Documents / Vouchers</label>
                    <button type="button" onClick={() => documentInputRef.current?.click()}
                      className="h-7 px-3 rounded-lg bg-brand/10 border border-brand/20 text-brand text-xs font-medium cursor-pointer hover:bg-brand/20 transition-colors flex items-center gap-1.5">
                      <Paperclip className="h-3 w-3" /> Attach
                    </button>
                    <input ref={documentInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.rtf,image/*" multiple className="hidden" onChange={handleDocumentUpload} />
                  </div>
                  {(editingEvent?.documents?.length ?? 0) > 0 ? (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                      const { active, over } = e;
                      if (!over || active.id === over.id || !editingEvent?.documents) return;
                      const oldIdx = editingEvent.documents.findIndex(d => d.id === active.id);
                      const newIdx = editingEvent.documents.findIndex(d => d.id === over.id);
                      if (oldIdx === -1 || newIdx === -1) return;
                      setEditingEvent(prev => prev ? { ...prev, documents: arrayMove([...prev.documents!], oldIdx, newIdx) } : null);
                    }}>
                      <SortableContext items={editingEvent!.documents!.map(d => d.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-1.5">
                          {editingEvent!.documents!.map((doc, i) => (
                            <SortableItem key={doc.id} id={doc.id} handleClass="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-6 z-10 h-6 w-5 flex items-center justify-center text-muted-foreground opacity-0 group-hover/sort:opacity-100 hover:text-brand cursor-grab active:cursor-grabbing transition-opacity">
                              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-background border border-border hover:border-brand/40 transition-colors">
                                <div className="h-8 w-8 rounded-md bg-brand/10 flex items-center justify-center shrink-0">
                                  <FileText className="h-3.5 w-3.5 text-brand" />
                                </div>
                                <button type="button" onClick={() => handleOpenDocument(doc.url)} className="flex-1 min-w-0 text-left">
                                  <p className="text-xs font-bold text-foreground truncate">{doc.name}</p>
                                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{formatFileSize(doc.size)}</p>
                                </button>
                                <button type="button" onClick={() => handleRemoveDocument(i)}
                                  className="h-6 w-6 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 flex items-center justify-center transition-colors opacity-0 group-hover/sort:opacity-100 shrink-0">
                                  <Trash className="h-3 w-3" />
                                </button>
                              </div>
                            </SortableItem>
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  ) : (
                    <button type="button" onClick={() => documentInputRef.current?.click()}
                      className="w-full h-10 rounded-lg border-2 border-dashed border-border flex items-center justify-center gap-2 text-muted-foreground hover:border-brand/50 hover:text-brand transition-colors">
                      <Paperclip className="h-4 w-4" />
                      <span className="text-xs font-medium">Attach PDF, voucher, or booking confirmation</span>
                    </button>
                  )}
                </div>

                {/* People Assignment */}
                <div className="p-3 sm:p-4 border-t border-border bg-card space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-muted-foreground">People</label>
                    <div className="flex items-center gap-1 bg-secondary rounded-lg p-0.5">
                      <button
                        type="button"
                        onClick={() => setEditingEvent(prev => prev ? { ...prev, assignedTo: undefined } : null)}
                        aria-pressed={!editingEvent?.assignedTo}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          !editingEvent?.assignedTo
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Everyone
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingEvent(prev => prev ? { ...prev, assignedTo: prev.assignedTo?.length ? prev.assignedTo : [] } : null)}
                        aria-pressed={Array.isArray(editingEvent?.assignedTo)}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                          Array.isArray(editingEvent?.assignedTo)
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Specific
                      </button>
                    </div>
                  </div>
                  {editingEvent?.assignedTo !== undefined && (
                    <div className="space-y-1.5">
                      {tripTravelers.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {tripTravelers.map(t => {
                            const isAssigned = editingEvent.assignedTo?.includes(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => {
                                  setEditingEvent(prev => {
                                    if (!prev) return null;
                                    const current = prev.assignedTo || [];
                                    const next = isAssigned
                                      ? current.filter(id => id !== t.id)
                                      : [...current, t.id];
                                    return { ...prev, assignedTo: next };
                                  });
                                }}
                                className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border transition-all ${
                                  isAssigned
                                    ? "bg-brand/10 border-brand/30 text-brand"
                                    : "bg-background border-border text-muted-foreground hover:border-brand/30"
                                }`}
                              >
                                <PersonAvatar avatar={t.avatar} initials={t.initials} name={t.name} className="h-5 w-5" fallbackClassName="text-[8px] font-black" />
                                {t.name.split(" ")[0]}
                                {isAssigned && <Check className="h-3 w-3" />}
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground font-medium">
                          Add travelers in the People tab first to assign them to events.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                </div>{/* end media scroll area */}
              </div>
                </CollapsibleContent>
              </Collapsible>

              {/* ── Description & notes: traveler-facing copy and internal notes ── */}
              <Collapsible className="border-t border-border">
                <CollapsibleTrigger className="w-full flex items-center justify-between px-4 sm:px-6 py-3.5 text-left hover:bg-secondary transition-colors group/sec">
                  <span className="text-xs font-medium text-muted-foreground">Description &amp; notes</span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">
                      {[editingEvent?.description, editingEvent?.notes].filter(v => v?.trim()).length
                        ? `${[editingEvent?.description, editingEvent?.notes].filter(v => v?.trim()).length} written`
                        : "Empty"}
                    </span>
                    <CaretDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[panel-open]/sec:rotate-180" />
                  </span>
                </CollapsibleTrigger>
                <CollapsibleContent>
              <div>
                {/* AI Assist */}
                <div className="p-3 sm:p-4 bg-card">
                  <button
                    type="button"
                    onClick={handleAiAssist}
                    disabled={aiAssistLoading || (!editingEvent?.title && !editingEvent?.location)}
                    className="w-full h-9 rounded-lg bg-secondary border border-border text-foreground text-sm font-medium flex items-center justify-center gap-2 hover:bg-secondary/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {aiAssistLoading ? <SpinnerGap className="h-4 w-4 animate-spin text-muted-foreground" /> : <MagicWand className="h-4 w-4 text-muted-foreground" />}
                    {aiAssistLoading ? "Writing…" : "Write description and notes"}
                  </button>
                </div>

                {/* Description (visible to travelers) */}
                <div className="p-3 sm:p-4 border-t border-border bg-card space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Description (Visible to Travelers)</Label>
                  <Textarea value={editingEvent?.description || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, description: e.target.value } : null)} placeholder="Public-facing description travelers will see..." className="rounded-lg h-14 sm:h-20 text-sm font-medium bg-background border-border text-foreground resize-none focus-visible:border-brand focus-visible:ring-0" />
                </div>

                {/* Notes */}
                <div className="p-3 sm:p-4 border-t border-border bg-card space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground">Agent Notes (Internal)</Label>
                  <Textarea value={editingEvent?.notes || ""} onChange={e => setEditingEvent(prev => prev ? { ...prev, notes: e.target.value } : null)} className="rounded-lg h-14 sm:h-20 text-sm font-medium bg-background border-border text-foreground resize-none focus-visible:border-brand focus-visible:ring-0" />
                </div>
              </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Footer */}
            <div className="px-4 sm:px-8 py-4 sm:py-5 bg-card border-t border-border flex items-center justify-between gap-3 shrink-0">
              <Button type="button" variant="ghost" onClick={() => setIsEditPanelOpen(false)} className="h-10 px-4 text-[13px] font-medium text-muted-foreground">Cancel</Button>
              <Button disabled={savingChanges} type="submit" className="h-10 px-8 rounded-lg bg-brand hover:opacity-90 text-primary-foreground font-semibold text-[13px] shadow-lg shadow-brand/20">
                Save event
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <EventPhotosDialog
        trip={trip}
        open={photosOpen}
        onOpenChange={setPhotosOpen}
        onSave={images => {
          updateTrip(trip.id, { events: trip.events.map(e => images[e.id] ? { ...e, image: images[e.id], imagePosition: undefined } : e) });
          toast.success(`${Object.keys(images).length} ${Object.keys(images).length === 1 ? "photo" : "photos"} updated`);
        }}
      />
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md bg-card border-l border-border p-0 overflow-y-auto">
          <SheetHeader className="px-5 pt-5 pb-4 border-b border-border">
            <SheetTitle className="text-lg font-semibold tracking-tight text-foreground">History</SheetTitle>
            <SheetDescription className="text-sm text-muted-foreground">Who changed what on {trip.name}, newest first.</SheetDescription>
          </SheetHeader>
          <TripHistorySheet history={trip.history ?? []} />
        </SheetContent>
      </Sheet>
      <BulkAddPeopleDialog
        open={bulkAddOpen}
        onOpenChange={setBulkAddOpen}
        existing={allTravelers}
        tripName={trip.name}
        onTripIds={new Set([...(trip.travelerIds ?? []), ...(trip.travelers ?? []).map(t => t.id)])}
        onAdd={async selection => {
          await saveBulkPeople({ ...selection, tripId: trip.id });
          toast.success(`Saved ${selection.matched.length + selection.created.length} people and their trip details`);
        }}
      />
      <ImportItineraryDialog
        open={reimportOpen}
        onOpenChange={setReimportOpen}
        existingTripId={trip?.id}
      />

      <ShareTripDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        tripId={trip.id}
        tripName={trip.name}
        onPublish={handlePublish}
        publishing={publishing}
        notInvited={(trip.travelers ?? []).filter(t => !t.invitedAt).length}
        onEmailTravellers={() => { setShareOpen(false); handleSendEmail(); }}
      />

      {messageOpen && <MessageDialog open onOpenChange={setMessageOpen} trips={[trip]} />}

      <SendInviteModal
        open={sendInviteOpen}
        onOpenChange={setSendInviteOpen}
        trip={trip}
        travelers={tripTravelers}
        // The send endpoint stamps who was invited onto the trip itself; the trip listener brings it in
      />

      <ItineraryPreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        trip={trip}
      />

      {/* Edit Trip Dialog */}
      <Dialog open={editTripOpen} onOpenChange={setEditTripOpen}>
        <DialogContent className="max-w-2xl bg-card rounded-xl border border-border shadow-2xl overflow-hidden p-0 flex flex-col max-h-[calc(100dvh-2rem)]">
          <form onSubmit={handleSaveTrip} className="flex flex-col min-h-0 flex-1">
            <DialogHeader className="px-8 pt-8 pb-5 border-b border-border shrink-0">
              <DialogTitle className="text-2xl font-semibold tracking-tight text-foreground">Edit Trip</DialogTitle>
              <p className="text-xs text-muted-foreground font-medium mt-1">Configure trip details, organizer, and traveler information</p>
            </DialogHeader>
            <div className="p-6 space-y-6 flex-1 min-h-0 overflow-y-auto">

              {/* ── Section: Cover Image ── */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 mb-1">
                  <ImageIcon2 className="h-3.5 w-3.5 text-brand" />
                  <label className="text-xs font-medium text-muted-foreground">Cover Image</label>
                </div>
                {editingTrip.image && (
                  <FocalPointPicker src={editingTrip.image} value={editingTrip.imagePosition} onChange={imagePosition => setEditingTrip(prev => ({ ...prev, imagePosition }))} className="h-36 rounded-xl">
                    <div className="absolute inset-0 bg-linear-to-t from-black/40 to-transparent pointer-events-none" />
                  </FocalPointPicker>
                )}
                <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={tripImageSearch}
                      onChange={e => setTripImageSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); runTripImageSearch(tripImageSearch); } }}
                      placeholder="Search destinations…"
                      className="w-full pl-9"
                    />
                  </div>
                  <button type="button" onClick={() => coverInputRef.current?.click()}
                    className="h-9 w-9 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-brand transition-colors shrink-0"
                    title="Upload cover image">
                    <Upload className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => runTripImageSearch(tripImageSearch)}
                    className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity flex items-center gap-1 shrink-0">
                    {isTripImageSearching ? <SpinnerGap className="h-3 w-3 animate-spin" /> : <MagnifyingGlass className="h-3 w-3" />}
                  </button>
                  {tripImageResults.length > 0 && (
                    <>
                      <button type="button" aria-label="Refresh" onClick={() => runTripImageSearch(tripImageLastQuery || tripImageSearch, tripImagePage)} disabled={isTripImageSearching}
                        className="h-9 w-9 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-brand transition-colors shrink-0 disabled:opacity-40">
                        <ArrowsClockwise className={`h-3.5 w-3.5 ${isTripImageSearching ? "animate-spin" : ""}`} />
                      </button>
                      <button type="button" aria-label="Next page" onClick={() => runTripImageSearch(tripImageLastQuery || tripImageSearch, tripImagePage + 1)} disabled={isTripImageSearching}
                        className="h-9 w-9 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-brand transition-colors shrink-0 disabled:opacity-40">
                        <CaretRight className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => { setTripImageResults([]); setTripImageSearch(""); setTripImagePage(1); setTripImageLastQuery(""); }}
                        className="h-9 w-9 rounded-xl bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                  {isTripImageSearching ? (
                    <div className="col-span-2 sm:col-span-3 lg:col-span-5 flex items-center justify-center h-20 gap-2 text-muted-foreground">
                      <SpinnerGap className="h-4 w-4 animate-spin text-brand" />
                      <span className="text-xs font-medium">Searching…</span>
                    </div>
                  ) : tripImageResults.length > 0 ? (
                    tripImageResults.map((url, i) => (
                      <button key={i} type="button" onClick={() => setEditingTrip(prev => ({ ...prev, image: url, imagePosition: undefined }))}
                        className={`relative h-16 rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.03] ${editingTrip.image === url ? "border-brand shadow-lg shadow-brand/30 scale-[1.03]" : "border-transparent hover:border-brand/50"}`}>
                        <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" onError={e => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }} />
                      </button>
                    ))
                  ) : (
                    COVER_IMAGES.map(({ url, label }) => (
                      <button key={url} type="button" onClick={() => setEditingTrip(prev => ({ ...prev, image: url, imagePosition: undefined }))}
                        className={`relative h-16 rounded-xl overflow-hidden border-2 transition-all hover:scale-[1.03] ${editingTrip.image === url ? "border-brand shadow-lg shadow-brand/30 scale-[1.03]" : "border-transparent hover:border-brand/50"}`}>
                        <img src={url} alt={label} className="w-full h-full object-cover" loading="lazy" />
                        <div className="absolute inset-0 bg-linear-to-t from-black/60 to-black/10" />
                        <span className="absolute bottom-1 left-0 right-0 text-center text-[8px] font-medium text-white">{label}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* ── Section: Trip Details ── */}
              <div className="pt-5 border-t border-border">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin className="h-3.5 w-3.5 text-brand" />
                  <h4 className="text-xs font-medium text-muted-foreground">Trip Details</h4>
                </div>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">Trip Name</Label>
                    <Input value={editingTrip.name ?? ""} onChange={e => setEditingTrip(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Kenya Safari 2025" className="h-10 text-sm bg-background border-border text-foreground rounded-xl focus-visible:border-brand focus-visible:ring-0" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Destination</Label>
                      <Input value={editingTrip.destination ?? ""} onChange={e => setEditingTrip(prev => ({ ...prev, destination: e.target.value }))} placeholder="e.g., Nairobi, Kenya" className="h-10 text-sm bg-background border-border text-foreground rounded-xl focus-visible:border-brand focus-visible:ring-0" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium text-muted-foreground">Attendees</Label>
                      <Input value={editingTrip.attendees ?? ""} onChange={e => setEditingTrip(prev => ({ ...prev, attendees: e.target.value }))} placeholder="e.g., 4 Travelers" className="h-10 text-sm bg-background border-border text-foreground rounded-xl focus-visible:border-brand focus-visible:ring-0" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Start Date</label>
                      <Popover>
                        <PopoverTrigger className="w-full h-10 px-3 text-sm font-semibold bg-background border border-border text-foreground rounded-xl focus:outline-none focus:border-brand transition-colors flex items-center justify-between gap-2 text-left">
                          <span className={editingTrip.start ? "" : "text-muted-foreground"}>
                            {editingTrip.start ? format(parseISO(editingTrip.start), "d MMM yyyy") : "Select date"}
                          </span>
                          <CalendarDots className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </PopoverTrigger>
                        <PopoverContent align="start" className="p-0 w-auto">
                          <Calendar mode="single" selected={editingTrip.start ? parseISO(editingTrip.start) : undefined} onSelect={d => d && setEditingTrip(prev => ({ ...prev, start: format(d, "yyyy-MM-dd") }))} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">End Date</label>
                      <Popover>
                        <PopoverTrigger className="w-full h-10 px-3 text-sm font-semibold bg-background border border-border text-foreground rounded-xl focus:outline-none focus:border-brand transition-colors flex items-center justify-between gap-2 text-left">
                          <span className={editingTrip.end ? "" : "text-muted-foreground"}>
                            {editingTrip.end ? format(parseISO(editingTrip.end), "d MMM yyyy") : "Select date"}
                          </span>
                          <CalendarDots className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </PopoverTrigger>
                        <PopoverContent align="start" className="p-0 w-auto">
                          <Calendar mode="single" selected={editingTrip.end ? parseISO(editingTrip.end) : undefined} onSelect={d => d && setEditingTrip(prev => ({ ...prev, end: format(d, "yyyy-MM-dd") }))} />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Currency</label>
                      <Select value={editingTrip.currency ?? "USD"} onValueChange={v => setEditingTrip(prev => ({ ...prev, currency: v ?? "USD" }))}>
                        <SelectTrigger className="w-full h-10 rounded-lg" aria-label="Currency"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem key="USD" value="USD">USD - US Dollar</SelectItem>
                          <SelectItem key="EUR" value="EUR">EUR - Euro</SelectItem>
                          <SelectItem key="GBP" value="GBP">GBP - British Pound</SelectItem>
                          <SelectItem key="AED" value="AED">AED - UAE Dirham</SelectItem>
                          <SelectItem key="AUD" value="AUD">AUD - Australian Dollar</SelectItem>
                          <SelectItem key="CAD" value="CAD">CAD - Canadian Dollar</SelectItem>
                          <SelectItem key="CHF" value="CHF">CHF - Swiss Franc</SelectItem>
                          <SelectItem key="CNY" value="CNY">CNY - Chinese Yuan</SelectItem>
                          <SelectItem key="INR" value="INR">INR - Indian Rupee</SelectItem>
                          <SelectItem key="JPY" value="JPY">JPY - Japanese Yen</SelectItem>
                          <SelectItem key="KES" value="KES">KES - Kenyan Shilling</SelectItem>
                          <SelectItem key="MXN" value="MXN">MXN - Mexican Peso</SelectItem>
                          <SelectItem key="NGN" value="NGN">NGN - Nigerian Naira</SelectItem>
                          <SelectItem key="SGD" value="SGD">SGD - Singapore Dollar</SelectItem>
                          <SelectItem key="THB" value="THB">THB - Thai Baht</SelectItem>
                          <SelectItem key="ZAR" value="ZAR">ZAR - South African Rand</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Section: Organizer / Agent ── */}
              <div className="pt-5 border-t border-border">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-3.5 w-3.5 text-brand" />
                  <h4 className="text-xs font-medium text-muted-foreground">Organizer / Agent</h4>
                </div>
                <OrganizerPersonSelect people={tripTravelers} value={editingTrip.organizer || {}} onChange={organizer => setEditingTrip(prev => ({ ...prev, organizer: { ...organizer, name: organizer.name || "" } }))} />
                <div className="flex gap-5">
                  {/* Avatar preview */}
                  <div className="shrink-0 flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                      {editingTrip.organizer?.avatar ? <img src={editingTrip.organizer.avatar} alt="" className="w-full h-full rounded-xl object-cover" /> : editingTrip.organizer?.name ? (
                        <span className="text-lg font-bold text-brand">
                          {editingTrip.organizer.name.split(" ").slice(0, 2).map((w: string) => w[0]).join("")}
                        </span>
                      ) : (
                        <Users className="h-6 w-6 text-brand/40" />
                      )}
                    </div>
                    <span className="text-[8px] font-bold text-muted-foreground uppercase tracking-wider">Preview</span>
                  </div>
                  {/* Fields */}
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    {([
                      { key: "name" as const, label: "Full Name", placeholder: "e.g., Jane Smith", span: 2 },
                      { key: "role" as const, label: "Role", placeholder: "e.g., Travel Consultant" },
                      { key: "company" as const, label: "Company", placeholder: "e.g., Acme Travel" },
                      { key: "email" as const, label: "Email", placeholder: "e.g., jane@acme.com" },
                      { key: "phone" as const, label: "Phone", placeholder: "e.g., +1 555 0123" },
                    ] satisfies { key: keyof TripOrganizer; label: string; placeholder: string; span?: number }[]).map(f => (
                      <div key={f.key} className={`space-y-1 ${f.span === 2 ? "col-span-2" : ""}`}>
                        <Label className="text-xs font-medium text-muted-foreground">{f.label}</Label>
                        <Input
                          disabled={savingChanges || (!!editingTrip.organizer?.travelerId && (f.key === "name" || f.key === "email"))}
                          value={editingTrip.organizer?.[f.key] ?? ""}
                          onChange={e => setEditingTrip(prev => ({ ...prev, organizer: { ...(prev.organizer ?? { name: "" }), [f.key]: e.target.value } }))}
                          placeholder={f.placeholder}
                          className="h-9 text-sm bg-background border-border text-foreground rounded-xl focus-visible:border-brand focus-visible:ring-0"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Section: Information & Documents ── */}
              <div className="pt-5 border-t border-border">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-brand" />
                    <h4 className="text-xs font-medium text-muted-foreground">Trip information</h4>
                    {(editingTrip.info?.length ?? 0) > 0 && (
                      <span className="text-[9px] font-bold text-brand bg-brand/10 px-2 py-0.5 rounded-lg">{editingTrip.info!.length}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditingTrip(prev => ({
                      ...prev,
                      info: [...(prev.info ?? []), { id: Date.now().toString(), title: "", body: "" }],
                    }))}
                    className="h-7 px-3 rounded-lg bg-brand/10 hover:bg-brand/20 text-xs font-medium text-brand transition-colors flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add Page
                  </button>
                </div>
                {(editingTrip.info ?? []).length === 0 && (
                  <div className="text-center py-8 rounded-xl border-2 border-dashed border-border bg-slate-50/50 dark:bg-[#080808]">
                    <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto mb-3">
                      <FileText className="h-5 w-5 text-brand/50" />
                    </div>
                    <p className="text-xs text-muted-foreground font-bold">No information pages yet</p>
                    <p className="text-[10px] text-muted-foreground mt-1 max-w-[200px] mx-auto">Add travel tips, visa info, packing lists, and more for your travelers</p>
                  </div>
                )}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                  const { active, over } = e;
                  if (!over || active.id === over.id) return;
                  const items = editingTrip.info ?? [];
                  const oldIdx = items.findIndex(i => i.id === active.id);
                  const newIdx = items.findIndex(i => i.id === over.id);
                  if (oldIdx === -1 || newIdx === -1) return;
                  setEditingTrip(prev => ({ ...prev, info: arrayMove([...(prev.info ?? [])], oldIdx, newIdx) }));
                }}>
                  <SortableContext items={(editingTrip.info ?? []).map(i => i.id)} strategy={verticalListSortingStrategy}>
                    {(editingTrip.info ?? []).map((item, idx) => (
                      <SortableItem key={item.id} id={item.id} handleClass="absolute left-1 top-3 z-10 h-7 w-5 flex items-center justify-center text-muted-foreground opacity-0 group-hover/sort:opacity-100 hover:text-brand cursor-grab active:cursor-grabbing transition-opacity">
                        <div className="mb-3 rounded-xl bg-card border border-border overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3 px-4 py-3">
                            <div className="shrink-0 w-7 h-7 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center">
                              <span className="text-[11px] font-black text-brand">{idx + 1}</span>
                            </div>
                            <Input
                              value={item.title}
                              onChange={e => {
                                const updated = [...(editingTrip.info ?? [])];
                                updated[idx] = { ...updated[idx], title: e.target.value };
                                setEditingTrip(prev => ({ ...prev, info: updated }));
                              }}
                              placeholder="Page title - e.g., Visa Requirements"
                              className="h-8 text-sm font-bold bg-transparent border-0 text-foreground focus-visible:ring-0 p-0 flex-1 placeholder:text-slate-300 dark:placeholder:text-[#333]"
                            />
                            <button
                              type="button"
                              title={item.leaderOnly ? "Leader only - hidden from travelers" : "Visible to everyone"}
                              onClick={() => {
                                const updated = [...(editingTrip.info ?? [])];
                                updated[idx] = { ...updated[idx], leaderOnly: !updated[idx].leaderOnly };
                                setEditingTrip(prev => ({ ...prev, info: updated }));
                              }}
                              className={`shrink-0 h-7 w-7 rounded-lg flex items-center justify-center transition-all ${item.leaderOnly ? "text-amber-500 bg-amber-500/10 hover:bg-amber-500/20" : "text-muted-foreground hover:text-brand hover:bg-brand/10 opacity-0 group-hover/sort:opacity-100"}`}
                            >
                              {item.leaderOnly ? <EyeSlash className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = (editingTrip.info ?? []).filter((_, i) => i !== idx);
                                setEditingTrip(prev => ({ ...prev, info: updated }));
                              }}
                              className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover/sort:opacity-100 transition-all"
                            >
                              <Trash className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="px-4 pb-4">
                            <Textarea
                              value={item.body}
                              onChange={e => {
                                const updated = [...(editingTrip.info ?? [])];
                                updated[idx] = { ...updated[idx], body: e.target.value };
                                setEditingTrip(prev => ({ ...prev, info: updated }));
                              }}
                              placeholder="Write content that travelers will see... URLs become clickable links automatically."
                              className="min-h-[100px] text-sm bg-secondary dark:bg-[#080808] border border-border text-foreground resize-none rounded-xl focus-visible:border-brand focus-visible:ring-0 px-3 py-2.5 leading-relaxed placeholder:text-slate-300 dark:placeholder:text-[#333]"
                            />
                          </div>
                        </div>
                      </SortableItem>
                    ))}
                  </SortableContext>
                </DndContext>
              </div>

              {/* ── Section: Status ── */}
              <div className="pt-5 border-t border-border">
                <div className="flex items-center gap-2 mb-4">
                  <Tag className="h-3.5 w-3.5 text-brand" />
                  <h4 className="text-xs font-medium text-muted-foreground">Status</h4>
                </div>
                <div className="flex gap-2">
                  {(["Draft", "In Progress", "Published"] as const).map(s => (
                    <button key={s} type="button" onClick={() => setEditingTrip(prev => ({ ...prev, status: s }))}
                      className={`flex-1 h-11 rounded-xl text-xs font-medium transition-all ${
                        editingTrip.status === s
                          ? s === "Published" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                            : s === "In Progress" ? "bg-primary text-primary-foreground shadow-lg shadow-brand/20"
                            : "bg-slate-800 dark:bg-white text-white dark:text-black shadow-lg"
                          : "bg-secondary text-muted-foreground hover:bg-slate-200 dark:hover:bg-secondary"
                      }`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter className="px-8 py-5 border-t border-border flex items-center justify-between shrink-0">
              <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2" onClick={() => setEditTripOpen(false)}>Cancel</button>
              <Button disabled={savingChanges} type="submit" className="h-11 px-10 rounded-xl bg-brand hover:opacity-90 text-slate-900 dark:text-black font-medium text-xs shadow-lg shadow-brand/20">Save Changes</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Organizer mini-dialog ── */}
      <Dialog open={editOrgOpen} onOpenChange={setEditOrgOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto bg-card rounded-xl border border-border shadow-2xl p-0">
          <form onSubmit={handleSaveOrg}>
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center">
                  <Users className="h-4 w-4 text-brand" />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">Organizer</DialogTitle>
                  <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Trip contact person visible to travelers</p>
                </div>
              </div>
            </DialogHeader>
            <div className="p-6 space-y-3">
              <OrganizerPersonSelect people={tripTravelers} value={editOrgData} onChange={setEditOrgData} />
              {([
                { key: "name" as const, label: "Full Name", placeholder: "e.g., Jane Smith" },
                { key: "role" as const, label: "Role", placeholder: "e.g., Travel Consultant" },
                { key: "company" as const, label: "Company", placeholder: "e.g., Acme Travel" },
                { key: "email" as const, label: "Email", placeholder: "e.g., jane@acme.com" },
                { key: "phone" as const, label: "Phone", placeholder: "e.g., +1 555 0123" },
              ] satisfies { key: keyof TripOrganizer; label: string; placeholder: string }[]).map(f => (
                <div key={f.key} className="space-y-1">
                  <Label className="text-xs font-medium text-muted-foreground">{f.label}</Label>
                  <Input
                    disabled={savingChanges || (!!editOrgData.travelerId && (f.key === "name" || f.key === "email"))}
                    value={editOrgData[f.key] ?? ""}
                    onChange={e => setEditOrgData(prev => ({ ...prev, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="h-10 text-sm bg-background border-border text-foreground rounded-xl focus-visible:border-brand focus-visible:ring-0"
                  />
                </div>
              ))}
            </div>
            <DialogFooter className="px-6 py-4 border-t border-border flex items-center justify-between">
              <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2" onClick={() => setEditOrgOpen(false)}>Cancel</button>
              <Button disabled={savingChanges} type="submit" className="h-10 px-8 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-medium text-xs">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Information mini-dialog ── */}
      <Dialog open={editInfoOpen} onOpenChange={setEditInfoOpen}>
        <DialogContent initialFocus={() => document.querySelector<HTMLElement>('[aria-label="Page title"]')} className="dialog-mobile-full border-0 bg-card p-0 gap-0 overflow-hidden sm:w-[calc(100vw-2rem)] sm:max-w-2xl sm:h-auto sm:max-h-[85vh] sm:rounded-xl sm:border sm:border-border shadow-2xl flex flex-col">
          <form onSubmit={handleSaveInfo} className="flex flex-col h-full sm:h-auto sm:max-h-[85vh]">
            <DialogHeader className="px-5 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-border shrink-0">
              <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">Trip information</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Pages travellers see in the app, with files for the whole trip below.</p>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4">
              {editInfoData.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-sm font-medium text-foreground">No pages yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Visa rules, contacts, packing lists, anything travellers should know.</p>
                  {/* Travellers still see the published copy; if that has cards, they can be brought back here */}
                  {(trip.publishedSnapshot?.info?.length ?? 0) > 0 && (
                    <div className="mt-5 flex flex-col items-center gap-2">
                      <p className="text-xs text-muted-foreground">The published version travellers see has {trip.publishedSnapshot!.info!.length} {trip.publishedSnapshot!.info!.length === 1 ? "page" : "pages"}.</p>
                      <button
                        type="button"
                        onClick={() => setEditInfoData(trip.publishedSnapshot!.info!.map(i => ({ ...i, documents: i.documents ? [...i.documents] : undefined })))}
                        className="h-9 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 transition-opacity"
                      >
                        Restore from published version
                      </button>
                    </div>
                  )}
                </div>
              )}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e: DragEndEvent) => {
                const { active, over } = e;
                if (!over || active.id === over.id) return;
                const oldIdx = editInfoData.findIndex(i => i.id === active.id);
                const newIdx = editInfoData.findIndex(i => i.id === over.id);
                if (oldIdx === -1 || newIdx === -1) return;
                setEditInfoData(prev => arrayMove([...prev], oldIdx, newIdx));
              }}>
                <SortableContext items={editInfoData.map(i => i.id)} strategy={verticalListSortingStrategy}>
                  {editInfoData.map((item, idx) => (
                    <SortableItem key={item.id} id={item.id} handleClass="absolute left-1.5 top-4 z-10 h-7 w-5 flex items-center justify-center text-muted-foreground opacity-0 group-hover/sort:opacity-100 [@media(hover:none)]:opacity-100 hover:text-foreground cursor-grab active:cursor-grabbing transition-opacity">
                      <div data-info-page={item.id} className="rounded-xl border border-border bg-background scroll-mt-4">
                        <div className="flex items-center gap-3 pl-8 pr-3 pt-3">
                          <Input
                            value={item.title}
                            onChange={e => {
                              const updated = [...editInfoData];
                              updated[idx] = { ...updated[idx], title: e.target.value };
                              setEditInfoData(updated);
                            }}
                            placeholder="Page title, e.g. Visa requirements"
                            aria-label="Page title"
                            className="h-9 text-base font-semibold bg-transparent dark:bg-transparent border-0 shadow-none text-foreground focus-visible:ring-0 p-0 flex-1"
                          />
                          {/* Leaders only: kept from travellers, shown to trip leaders */}
                          <label className="flex items-center gap-2 shrink-0 text-xs text-muted-foreground cursor-pointer select-none">
                            <Switch
                              size="sm"
                              checked={!!item.leaderOnly}
                              onCheckedChange={checked => {
                                const updated = [...editInfoData];
                                updated[idx] = { ...updated[idx], leaderOnly: checked || undefined };
                                setEditInfoData(updated);
                              }}
                            />
                            Leaders only
                          </label>
                          <button
                            type="button"
                            aria-label={`Delete ${item.title || "page"}`}
                            onClick={() => setEditInfoData(prev => prev.filter((_, i) => i !== idx))}
                            className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 sm:opacity-0 sm:group-hover/sort:opacity-100 focus-visible:opacity-100 transition-all"
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="pl-8 pr-4 pb-3 space-y-3">
                          <Textarea
                            value={item.body}
                            onChange={e => {
                              const updated = [...editInfoData];
                              updated[idx] = { ...updated[idx], body: e.target.value };
                              setEditInfoData(updated);
                            }}
                            placeholder="What travellers should know. Links and phone numbers become tappable."
                            aria-label="Page text"
                            rows={Math.max(3, (item.body.match(/\n/g) || []).length + 2)}
                            className="min-h-[72px] text-sm leading-relaxed bg-transparent dark:bg-transparent border-0 shadow-none text-foreground/80 resize-y rounded-none focus-visible:ring-0 p-0"
                          />
                          {/* Per-page attachments */}
                          {item.documents && item.documents.length > 0 && (
                            <div className="space-y-1.5">
                              {item.documents.map((doc, docIdx) => (
                                <div key={doc.id} className="group/pdoc flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border hover:border-brand/30 transition-colors">
                                  <Paperclip className="h-3 w-3 text-brand shrink-0" />
                                  {renamingDocId === doc.id ? (
                                    <Input
                                      autoFocus
                                      value={renameValue}
                                      onChange={e => setRenameValue(e.target.value)}
                                      onBlur={() => {
                                        if (renameValue.trim()) {
                                          const updated = [...editInfoData];
                                          const docs = [...(updated[idx].documents || [])];
                                          docs[docIdx] = { ...docs[docIdx], name: renameValue.trim() };
                                          updated[idx] = { ...updated[idx], documents: docs };
                                          setEditInfoData(updated);
                                        }
                                        setRenamingDocId(null);
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                        if (e.key === "Escape") setRenamingDocId(null);
                                      }}
                                      className="flex-1 font-bold"
                                    />
                                  ) : (
                                    <span
                                      className="text-xs font-bold text-foreground truncate flex-1 cursor-pointer"
                                      onDoubleClick={() => { setRenamingDocId(doc.id); setRenameValue(doc.name); }}
                                      title="Double-click to rename"
                                    >{doc.name}</span>
                                  )}
                                  <span className="text-[9px] text-muted-foreground font-medium shrink-0">{formatFileSize(doc.size)}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = [...editInfoData];
                                      updated[idx] = { ...updated[idx], documents: (updated[idx].documents || []).filter(d => d.id !== doc.id) };
                                      setEditInfoData(updated);
                                    }}
                                    className="shrink-0 h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover/pdoc:opacity-100 transition-all"
                                  >
                                    <Trash className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <label className="flex items-center gap-2 cursor-pointer text-muted-foreground hover:text-brand transition-colors">
                            <input type="file" multiple accept={TRIP_DOC_ACCEPT} onChange={e => { handleInfoPageDocFiles(Array.from(e.target.files || []), idx); e.target.value = ""; }} className="hidden" />
                            <Paperclip className="h-3 w-3" />
                            <span className="text-xs font-medium">Attach files</span>
                          </label>
                        </div>
                      </div>
                    </SortableItem>
                  ))}
                </SortableContext>
              </DndContext>
              <Button type="button" variant="outline" onClick={() => setEditInfoData(prev => [...prev, { id: Date.now().toString(), title: "", body: "" }])} className="w-full">
                <Plus /> Add page
              </Button>

              {/* Documents section inside edit dialog */}
              <div className="mt-8">
                <p className="text-sm font-medium text-foreground mb-1">Files for the whole trip</p>
                <p className="text-xs text-muted-foreground mb-3">Tickets, vouchers and guides travellers can open from Trip info.</p>
                {trip.documents && trip.documents.length > 0 && (
                  <div className="space-y-1.5 mb-3">
                    {trip.documents.map(doc => (
                      <div key={doc.id} className="group/doc flex items-center gap-3 px-3.5 py-2.5 rounded-xl bg-card border border-border hover:border-brand/30 transition-colors">
                        <Paperclip className="h-3.5 w-3.5 text-brand shrink-0" />
                        <div className="min-w-0 flex-1">
                          {renamingDocId === doc.id ? (
                            <Input
                              autoFocus
                              value={renameValue}
                              onChange={e => setRenameValue(e.target.value)}
                              onBlur={() => { handleRenameTripDoc(doc.id, renameValue); setRenamingDocId(null); }}
                              onKeyDown={e => { if (e.key === "Enter") { handleRenameTripDoc(doc.id, renameValue); setRenamingDocId(null); } if (e.key === "Escape") setRenamingDocId(null); }}
                              className="w-full font-bold"
                            />
                          ) : (
                            <span
                              className="text-sm font-bold text-foreground truncate block cursor-pointer"
                              onDoubleClick={() => { setRenamingDocId(doc.id); setRenameValue(doc.name); }}
                              title="Double-click to rename"
                            >{doc.name}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-medium shrink-0">{formatFileSize(doc.size)}</span>
                        <button type="button" onClick={() => handleRemoveTripDoc(doc.id)} className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-red-500 hover:bg-red-500/10 opacity-0 group-hover/doc:opacity-100 transition-all">
                          <Trash className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={tripDocInputRef2} type="file" multiple accept={TRIP_DOC_ACCEPT} onChange={handleTripDocInput} className="hidden" />
                <button
                  type="button"
                  onClick={() => tripDocInputRef2.current?.click()}
                  className="w-full py-3 px-4 rounded-xl border border-dashed border-border hover:border-foreground/30 hover:bg-secondary/50 transition-colors flex items-center justify-center gap-2"
                >
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Upload files</span>
                </button>
              </div>
            </div>
            <DialogFooter className="px-5 sm:px-6 py-4 border-t border-border flex items-center justify-between shrink-0">
              <button type="button" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors px-4 py-2" onClick={() => setEditInfoOpen(false)}>Cancel</button>
              <Button disabled={savingChanges} type="submit" className="h-10 px-8 rounded-xl bg-primary hover:opacity-90 text-primary-foreground font-medium text-xs">Save</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={open => { if (!open) setRemoveTarget(null); }}
        title={`Remove ${removeTarget?.name ?? "traveller"}?`}
        description={`${removeTarget?.name ?? "They"} already use the app for this trip. Removing them unlinks their account: they stay on the trip but will see everyone's plan instead of their own.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => { if (removeTarget) await removeTravelerFromTrip(removeTarget); setRemoveTarget(null); }}
      />

      <ConfirmDialog
        open={!!removeMemberTarget}
        onOpenChange={(open) => { if (!open) setRemoveMemberTarget(null); }}
        title="Remove from trip"
        description={`${removeMemberTarget?.name ?? "They"} leave this trip in the app. Their account and their other trips are untouched; they can join again with the PIN.`}
        confirmLabel="Remove"
        destructive
        onConfirm={async () => {
          const target = removeMemberTarget;
          if (!target) return;
          try {
            for (const key of target.keys) await removeUserFromTrip(key, trip.id);
            setMembersReload(n => n + 1);
            toast.success(`${target.name} removed from the app for this trip`);
          } catch {
            toast.error("Couldn't remove them. Only editors can do this.");
          }
          setRemoveMemberTarget(null);
        }}
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        title="Delete Trip"
        description={`Are you sure you want to delete "${trip.name}"? This cannot be undone.`}
        confirmLabel="Delete Trip"
        onConfirm={handleDeleteTrip}
        destructive
      />

      <DemoUpgradeDialog open={upgradeOpen} onOpenChange={setUpgradeOpen} />

      {/* Hidden off-screen div for PDF export - renders the preview layout in light theme */}
      <div
        ref={pdfRef}
        className="fixed left-[-9999px] top-0 w-[800px] bg-white"
        style={brand.accentColor ? { "--brand-rgb": hexToRgb(brand.accentColor) } as React.CSSProperties : undefined}
      >
        <ItineraryPreviewContent trip={trip} forPrint />
      </div>
    </div>
  );
}
