import { useState, useMemo, useEffect } from "react";
import "leaflet/dist/leaflet.css";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { 
  Plus, 
  Search, 
  MoreVertical, 
  Calendar as LucideCalendar, 
  Plane, 
  Hotel, 
  MapPin, 
  ChevronLeft, 
  Camera, 
  Trash2, 
  Settings, 
  ExternalLink, 
  Map as MapIcon, 
  Navigation, 
  Globe,
  ArrowUpRight,
  LayoutGrid, 
  List,
  Compass,
  LayoutDashboard,
  Briefcase,
  Users,
  PieChart,
  LogOut,
  Bell,
  Moon,
  Sun,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Zap,
  Activity,
  Utensils,
  Clock,
  Image as ImageIcon,
  Layout,
  ChevronRight
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";

// --- Types ---

type View = "dashboard" | "workspace";
type DisplayMode = "grid" | "list";
type Theme = "light" | "dark";

interface TravelEvent {
  id: string;
  type: "flight" | "hotel" | "activity" | "dining";
  date: string; // YYYY-MM-DD
  time: string;
  title: string;
  location: string;
  image?: string;
  confNumber?: string;
  roomType?: string;
  airline?: string;
  flightNum?: string;
  terminal?: string;
  arrTerminal?: string;
  duration?: string;
  status?: string;
  checkin?: string;
  checkout?: string;
  notes?: string;
}

interface Trip {
  id: string;
  name: string;
  attendees: string;
  start: string;
  end: string;
  status: "Draft" | "Published" | "In Progress";
  image: string;
  events: TravelEvent[];
}

// --- Initial Data ---

const INITIAL_TRIPS: Trip[] = [
  { 
    id: "1", 
    name: "Kenya Luxury Safari", 
    attendees: "Senior Agents", 
    start: "2026-03-17", 
    end: "2026-03-24", 
    status: "In Progress", 
    image: "https://images.unsplash.com/photo-1523805009345-7448845a9e53?q=80&w=1000&auto=format&fit=crop",
    events: [
      { id: "e1", type: "flight", date: "2026-03-17", time: "10:35 AM", title: "Qatar Airways — QR28", location: "MAN to DOH", airline: "Qatar Airways", flightNum: "QR28", terminal: "T2", duration: "7h 15m", status: "On Time" },
      { id: "e1b", type: "flight", date: "2026-03-17", time: "08:10 PM", title: "Qatar Airways — QR310", location: "DOH to NBO", airline: "Qatar Airways", flightNum: "QR310", terminal: "T1", arrTerminal: "T1A", duration: "5h 20m", status: "On Time" },
      { id: "e2", type: "hotel", date: "2026-03-18", time: "02:00 PM", title: "Hemingways Nairobi", location: "Karen, Nairobi", image: "https://images.unsplash.com/photo-1516426122078-c23e76319801?q=80&w=500&auto=format&fit=crop", checkin: "2:00 PM", checkout: "10:00 AM", roomType: "Superior Suite", confNumber: "HEM-40291", status: "Confirmed" },
      { id: "e2b", type: "activity", date: "2026-03-18", time: "04:00 PM", title: "Giraffe Centre & Karen Blixen Museum", location: "Karen, Nairobi", status: "Confirmed", notes: "Hand-feed Rothschild giraffes, guided museum tour" },
      { id: "e2c", type: "dining", date: "2026-03-18", time: "07:30 PM", title: "Welcome Dinner at Carnivore", location: "Langata Road, Nairobi", status: "Confirmed", notes: "Famous nyama choma restaurant, group booking for 12" },
      { id: "e2d", type: "flight", date: "2026-03-19", time: "07:00 AM", title: "Safari Link — Private Charter", location: "Wilson Airport to Masai Mara", duration: "1h 10m", status: "Confirmed", notes: "15kg soft bag limit per person" },
      { id: "e2e", type: "hotel", date: "2026-03-19", time: "09:30 AM", title: "Angama Mara", location: "Masai Mara, Great Rift Valley", image: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?q=80&w=500&auto=format&fit=crop", checkin: "11:00 AM", checkout: "10:00 AM", roomType: "Tented Suite with Rift Valley View", confNumber: "ANG-88412", status: "Confirmed" },
      { id: "e2f", type: "activity", date: "2026-03-19", time: "03:30 PM", title: "Afternoon Game Drive", location: "Masai Mara National Reserve", status: "Confirmed", notes: "Open-top Land Cruiser, sundowners included" },
      { id: "e2g", type: "activity", date: "2026-03-20", time: "05:30 AM", title: "Hot Air Balloon Safari at Sunrise", location: "Masai Mara", status: "Confirmed", notes: "Champagne bush breakfast after landing" },
      { id: "e2h", type: "activity", date: "2026-03-20", time: "10:00 AM", title: "Full Day Big Five Game Drive", location: "Masai Mara National Reserve", status: "Confirmed", notes: "Packed lunch, focus on big cat tracking with expert guide" },
      { id: "e2i", type: "dining", date: "2026-03-20", time: "07:00 PM", title: "Bush Dinner Under the Stars", location: "Angama Mara Private Site", status: "Confirmed", notes: "Lantern-lit dinner on the escarpment, 4-course menu" },
      { id: "e2j", type: "activity", date: "2026-03-21", time: "06:00 AM", title: "Dawn Game Drive — Mara River Crossing", location: "Mara River, Masai Mara", status: "Confirmed", notes: "Prime location for wildebeest and hippo sightings" },
      { id: "e2k", type: "activity", date: "2026-03-21", time: "02:00 PM", title: "Maasai Village Cultural Visit", location: "Maasai Community, Masai Mara", status: "Confirmed", notes: "Community-led tour, beadwork demonstration, warrior dance" },
      { id: "e2l", type: "flight", date: "2026-03-22", time: "10:00 AM", title: "Safari Link — Private Charter", location: "Masai Mara to Amboseli", duration: "55m", status: "Confirmed" },
      { id: "e2m", type: "hotel", date: "2026-03-22", time: "12:00 PM", title: "Tortilis Camp", location: "Amboseli National Park", checkin: "12:00 PM", checkout: "10:00 AM", roomType: "Private Tent with Kilimanjaro View", confNumber: "TRC-56710", status: "Confirmed" },
      { id: "e2n", type: "activity", date: "2026-03-22", time: "04:00 PM", title: "Kilimanjaro Sunset Game Drive", location: "Amboseli National Park", status: "Confirmed", notes: "Elephant herds against Mt Kilimanjaro backdrop" },
      { id: "e2o", type: "activity", date: "2026-03-23", time: "06:30 AM", title: "Amboseli Guided Walking Safari", location: "Amboseli Conservancy", status: "Confirmed", notes: "3-hour walk with Maasai ranger, bird watching" },
      { id: "e2p", type: "activity", date: "2026-03-23", time: "03:00 PM", title: "Observation Hill & Wetlands Drive", location: "Amboseli National Park", status: "Confirmed", notes: "Panoramic views of Kilimanjaro and the park" },
      { id: "e2q", type: "dining", date: "2026-03-23", time: "07:30 PM", title: "Farewell Boma Dinner", location: "Tortilis Camp", status: "Confirmed", notes: "Traditional boma setting, campfire, Kenyan cuisine" },
      { id: "e2r", type: "flight", date: "2026-03-24", time: "08:00 AM", title: "Safari Link — Private Charter", location: "Amboseli to Wilson Airport", duration: "50m", status: "Confirmed" },
      { id: "e2s", type: "flight", date: "2026-03-24", time: "11:45 PM", title: "Qatar Airways — QR311", location: "NBO to DOH", airline: "Qatar Airways", flightNum: "QR311", terminal: "T1A", duration: "5h 10m", status: "Confirmed" },
      { id: "e2t", type: "flight", date: "2026-03-25", time: "08:20 AM", title: "Qatar Airways — QR27", location: "DOH to MAN", airline: "Qatar Airways", flightNum: "QR27", terminal: "T1", arrTerminal: "T2", duration: "7h 30m", status: "Confirmed" },
    ]
  },
  {
    id: "2",
    name: "Japan Discovery",
    attendees: "Executive Team",
    start: "2026-05-10",
    end: "2026-05-20",
    status: "Draft",
    image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?q=80&w=1000&auto=format&fit=crop",
    events: [
      { id: "e3", type: "flight", date: "2026-05-10", time: "11:20 AM", title: "British Airways — BA5", location: "LHR to NRT", airline: "British Airways", flightNum: "BA5", terminal: "T5", arrTerminal: "T1", duration: "11h 50m", status: "Confirmed" },
      { id: "e4", type: "hotel", date: "2026-05-10", time: "09:00 PM", title: "Park Hyatt Tokyo", location: "Shinjuku, Tokyo", image: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=500&auto=format&fit=crop", checkin: "3:00 PM", checkout: "12:00 PM", roomType: "Deluxe King", confNumber: "PHT-44821", status: "Confirmed" },
      { id: "e5", type: "activity", date: "2026-05-11", time: "09:00 AM", title: "Tsukiji Outer Market Food Tour", location: "Tsukiji, Tokyo", status: "Confirmed", notes: "3-hour guided tour with tastings" },
      { id: "e6", type: "activity", date: "2026-05-11", time: "02:00 PM", title: "Senso-ji Temple & Asakusa Walk", location: "Asakusa, Tokyo", status: "Confirmed" },
      { id: "e7", type: "dining", date: "2026-05-11", time: "07:00 PM", title: "Omakase at Sukiyabashi Jiro", location: "Ginza, Tokyo", status: "Confirmed", notes: "8-course tasting menu, smart casual dress code" },
      { id: "e8", type: "flight", date: "2026-05-13", time: "08:45 AM", title: "ANA — NH963", location: "HND to KIX", airline: "ANA", flightNum: "NH963", terminal: "T2", duration: "1h 15m", status: "Confirmed" },
      { id: "e9", type: "hotel", date: "2026-05-13", time: "12:00 PM", title: "The Ritz-Carlton Kyoto", location: "Kamogawa, Kyoto", checkin: "3:00 PM", checkout: "12:00 PM", roomType: "Garden Terrace Suite", confNumber: "RCK-77432", status: "Confirmed" },
      { id: "e10", type: "activity", date: "2026-05-14", time: "06:00 AM", title: "Fushimi Inari Shrine Sunrise Hike", location: "Fushimi, Kyoto", status: "Confirmed" },
      { id: "e11", type: "activity", date: "2026-05-14", time: "02:00 PM", title: "Traditional Tea Ceremony", location: "Gion District, Kyoto", status: "Confirmed", notes: "Private session with tea master" },
      { id: "e12", type: "flight", date: "2026-05-19", time: "05:30 PM", title: "JAL — JL44", location: "NRT to LHR", airline: "JAL", flightNum: "JL44", terminal: "T2", arrTerminal: "T3", duration: "12h 30m", status: "Confirmed" },
    ]
  },
  {
    id: "3",
    name: "Maldives Retreat",
    attendees: "Ash Murray",
    start: "2026-06-15",
    end: "2026-06-22",
    status: "Published",
    image: "https://images.unsplash.com/photo-1514282401047-d79a71a590e8?q=80&w=1000&auto=format&fit=crop",
    events: [
      { id: "e13", type: "flight", date: "2026-06-15", time: "09:15 AM", title: "Emirates — EK18", location: "MAN to DXB", airline: "Emirates", flightNum: "EK18", terminal: "T2", duration: "6h 55m", status: "Confirmed" },
      { id: "e14", type: "flight", date: "2026-06-15", time: "09:50 PM", title: "Emirates — EK652", location: "DXB to MLE", airline: "Emirates", flightNum: "EK652", terminal: "T3", duration: "4h 25m", status: "Confirmed" },
      { id: "e15", type: "flight", date: "2026-06-16", time: "10:30 AM", title: "Seaplane Transfer", location: "MLE to Baa Atoll", duration: "35m", status: "Confirmed", notes: "Max 20kg luggage per person" },
      { id: "e16", type: "hotel", date: "2026-06-16", time: "12:00 PM", title: "Soneva Fushi Resort", location: "Baa Atoll, Maldives", image: "https://images.unsplash.com/photo-1573843981267-be1999ff37cd?q=80&w=500&auto=format&fit=crop", checkin: "2:00 PM", checkout: "12:00 PM", roomType: "Overwater Villa with Pool", confNumber: "SNV-20261", status: "Confirmed" },
      { id: "e17", type: "activity", date: "2026-06-17", time: "06:30 AM", title: "Sunrise Dolphin Cruise", location: "Baa Atoll", status: "Confirmed" },
      { id: "e18", type: "activity", date: "2026-06-18", time: "09:00 AM", title: "Private Snorkelling — Hanifaru Bay", location: "UNESCO Biosphere Reserve", status: "Confirmed", notes: "Manta ray season, equipment provided" },
      { id: "e19", type: "dining", date: "2026-06-18", time: "07:30 PM", title: "Sandbank Dinner Under the Stars", location: "Private sandbank, Baa Atoll", status: "Confirmed", notes: "5-course seafood menu, boat transfer included" },
      { id: "e20", type: "activity", date: "2026-06-20", time: "10:00 AM", title: "Spa & Wellness Half-Day", location: "Soneva Fushi Spa", status: "Confirmed" },
      { id: "e21", type: "flight", date: "2026-06-22", time: "11:00 AM", title: "Seaplane Transfer", location: "Baa Atoll to MLE", duration: "35m", status: "Confirmed" },
      { id: "e22", type: "flight", date: "2026-06-22", time: "03:45 PM", title: "Emirates — EK653", location: "MLE to DXB", airline: "Emirates", flightNum: "EK653", terminal: "T1", duration: "4h 20m", status: "Confirmed" },
    ]
  },
  {
    id: "4",
    name: "Amalfi Coast Tour",
    attendees: "EU Sales Team",
    start: "2026-09-05",
    end: "2026-09-12",
    status: "Draft",
    image: "https://images.unsplash.com/photo-1633321088355-d0f81134ca3b?q=80&w=1000&auto=format&fit=crop",
    events: [
      { id: "e23", type: "flight", date: "2026-09-05", time: "07:10 AM", title: "Ryanair — FR8246", location: "MAN to NAP", airline: "Ryanair", flightNum: "FR8246", terminal: "T3", duration: "2h 45m", status: "Confirmed" },
      { id: "e24", type: "hotel", date: "2026-09-05", time: "02:00 PM", title: "Belmond Hotel Caruso", location: "Ravello, Amalfi Coast", image: "https://images.unsplash.com/photo-1602343168117-bb8ffe3e2e9f?q=80&w=500&auto=format&fit=crop", checkin: "3:00 PM", checkout: "11:00 AM", roomType: "Junior Suite Sea View", confNumber: "BHC-56190", status: "Confirmed" },
      { id: "e25", type: "activity", date: "2026-09-06", time: "09:30 AM", title: "Private Boat Tour — Positano & Capri", location: "Amalfi Marina", status: "Confirmed", notes: "Full day, lunch on Capri included" },
      { id: "e26", type: "dining", date: "2026-09-06", time: "08:00 PM", title: "Dinner at La Sponda", location: "Positano", status: "Confirmed", notes: "Michelin-starred, candlelit terrace" },
      { id: "e27", type: "activity", date: "2026-09-07", time: "10:00 AM", title: "Limoncello Tasting & Cooking Class", location: "Ravello", status: "Confirmed" },
      { id: "e28", type: "activity", date: "2026-09-08", time: "08:00 AM", title: "Path of the Gods Guided Hike", location: "Agerola to Positano", status: "Confirmed", notes: "Moderate difficulty, 7km trail, bring water" },
      { id: "e29", type: "dining", date: "2026-09-09", time: "07:30 PM", title: "Group Farewell Dinner", location: "Belmond Hotel Caruso Terrace", status: "Confirmed", notes: "Private terrace with infinity pool views" },
      { id: "e30", type: "flight", date: "2026-09-12", time: "12:30 PM", title: "Ryanair — FR8247", location: "NAP to MAN", airline: "Ryanair", flightNum: "FR8247", terminal: "T1", duration: "2h 50m", status: "Confirmed" },
    ]
  },
  {
    id: "5",
    name: "Iceland Coastal FAM",
    attendees: "Content & Media Team",
    start: "2026-09-14",
    end: "2026-09-20",
    status: "Published",
    image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1000&auto=format&fit=crop",
    events: [
      { id: "e31", type: "flight", date: "2026-09-14", time: "06:50 AM", title: "Icelandair — FI441", location: "MAN to KEF", airline: "Icelandair", flightNum: "FI441", terminal: "T3", duration: "3h 10m", status: "Confirmed" },
      { id: "e32", type: "hotel", date: "2026-09-14", time: "01:00 PM", title: "The Retreat at Blue Lagoon", location: "Grindavík, Iceland", image: "https://images.unsplash.com/photo-1515862122574-ef0e28b1bef1?q=80&w=500&auto=format&fit=crop", checkin: "3:00 PM", checkout: "11:00 AM", roomType: "Lagoon Suite", confNumber: "RBL-83291", status: "Confirmed" },
      { id: "e33", type: "activity", date: "2026-09-14", time: "04:00 PM", title: "Blue Lagoon Private Access", location: "Blue Lagoon, Grindavík", status: "Confirmed" },
      { id: "e34", type: "activity", date: "2026-09-15", time: "08:00 AM", title: "Golden Circle Full Day Tour", location: "Þingvellir, Geysir, Gullfoss", status: "Confirmed", notes: "Includes Þingvellir National Park, Strokkur geyser, Gullfoss waterfall" },
      { id: "e35", type: "activity", date: "2026-09-16", time: "09:00 AM", title: "Glacier Walk on Sólheimajökull", location: "South Coast", status: "Confirmed", notes: "All equipment provided, moderate fitness required" },
      { id: "e36", type: "activity", date: "2026-09-16", time: "03:00 PM", title: "Seljalandsfoss & Skógafoss Waterfalls", location: "South Coast", status: "Confirmed" },
      { id: "e37", type: "dining", date: "2026-09-16", time: "08:00 PM", title: "Dinner at Grillið", location: "Reykjavik", status: "Confirmed", notes: "Icelandic tasting menu with wine pairing" },
      { id: "e38", type: "activity", date: "2026-09-17", time: "10:00 PM", title: "Northern Lights Boat Tour", location: "Reykjavik Harbour", status: "Proposed", notes: "Weather dependent, backup date Sept 18" },
      { id: "e39", type: "flight", date: "2026-09-20", time: "02:15 PM", title: "Icelandair — FI442", location: "KEF to MAN", airline: "Icelandair", flightNum: "FI442", terminal: "T1", duration: "3h 05m", status: "Confirmed" },
    ]
  },
  {
    id: "6",
    name: "Bali VIP Retreat",
    attendees: "Top Performers 2025",
    start: "2026-11-01",
    end: "2026-11-10",
    status: "In Progress",
    image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?q=80&w=1000&auto=format&fit=crop",
    events: [
      { id: "e40", type: "flight", date: "2026-11-01", time: "09:30 PM", title: "Singapore Airlines — SQ53", location: "MAN to SIN", airline: "Singapore Airlines", flightNum: "SQ53", terminal: "T2", duration: "13h 05m", status: "Confirmed" },
      { id: "e41", type: "flight", date: "2026-11-02", time: "06:30 PM", title: "Singapore Airlines — SQ946", location: "SIN to DPS", airline: "Singapore Airlines", flightNum: "SQ946", terminal: "T3", duration: "2h 40m", status: "Confirmed" },
      { id: "e42", type: "hotel", date: "2026-11-02", time: "10:00 PM", title: "Four Seasons Sayan", location: "Ubud, Bali", image: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?q=80&w=500&auto=format&fit=crop", checkin: "3:00 PM", checkout: "12:00 PM", roomType: "Riverfront Villa", confNumber: "FSS-11482", status: "Confirmed" },
      { id: "e43", type: "activity", date: "2026-11-03", time: "07:00 AM", title: "Tegallalang Rice Terrace Sunrise Walk", location: "Tegallalang, Ubud", status: "Confirmed" },
      { id: "e44", type: "activity", date: "2026-11-03", time: "10:00 AM", title: "Traditional Balinese Cooking Class", location: "Ubud Village", status: "Confirmed", notes: "Market visit + 5-dish hands-on cooking" },
      { id: "e45", type: "activity", date: "2026-11-04", time: "05:00 AM", title: "Mount Batur Sunrise Trek", location: "Kintamani, Bali", status: "Confirmed", notes: "Pickup at 3:30 AM, breakfast at summit" },
      { id: "e46", type: "activity", date: "2026-11-04", time: "02:00 PM", title: "White Water Rafting — Ayung River", location: "Ayung River, Ubud", status: "Confirmed" },
      { id: "e47", type: "hotel", date: "2026-11-05", time: "12:00 PM", title: "AYANA Resort Bali", location: "Jimbaran, Bali", checkin: "2:00 PM", checkout: "12:00 PM", roomType: "Ocean View Suite", confNumber: "AYN-88741", status: "Confirmed" },
      { id: "e48", type: "activity", date: "2026-11-06", time: "09:00 AM", title: "Uluwatu Temple & Kecak Dance", location: "Uluwatu, Bali", status: "Confirmed" },
      { id: "e49", type: "dining", date: "2026-11-06", time: "06:30 PM", title: "Rock Bar Sunset Dinner", location: "AYANA Resort, Jimbaran", status: "Confirmed", notes: "Clifftop bar, seafood BBQ" },
      { id: "e50", type: "dining", date: "2026-11-08", time: "07:00 PM", title: "Awards Gala Dinner", location: "AYANA Grand Ballroom", status: "Confirmed", notes: "Black tie, award ceremony for top performers" },
      { id: "e51", type: "flight", date: "2026-11-10", time: "11:15 AM", title: "Singapore Airlines — SQ947", location: "DPS to SIN", airline: "Singapore Airlines", flightNum: "SQ947", terminal: "I", duration: "2h 45m", status: "Confirmed" },
    ]
  },
  {
    id: "7",
    name: "Swiss Alps Winter FAM",
    attendees: "Specialist Agents",
    start: "2027-01-15",
    end: "2027-01-22",
    status: "Draft",
    image: "https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?q=80&w=1000&auto=format&fit=crop",
    events: [
      { id: "e52", type: "flight", date: "2027-01-15", time: "07:00 AM", title: "SWISS — LX395", location: "MAN to ZRH", airline: "SWISS", flightNum: "LX395", terminal: "T1", duration: "1h 55m", status: "Confirmed" },
      { id: "e53", type: "activity", date: "2027-01-15", time: "12:00 PM", title: "GoldenPass Express to Interlaken", location: "Zürich HB to Interlaken Ost", status: "Confirmed", notes: "First class panoramic train, 2h journey" },
      { id: "e54", type: "hotel", date: "2027-01-15", time: "03:00 PM", title: "Victoria-Jungfrau Grand Hotel", location: "Interlaken, Switzerland", checkin: "3:00 PM", checkout: "11:00 AM", roomType: "Jungfrau View Suite", confNumber: "VJG-30281", status: "Confirmed" },
      { id: "e55", type: "activity", date: "2027-01-16", time: "08:00 AM", title: "Jungfraujoch — Top of Europe", location: "Jungfrau Region", status: "Confirmed", notes: "Cogwheel train to 3,454m, ice palace visit" },
      { id: "e56", type: "activity", date: "2027-01-17", time: "09:00 AM", title: "Grindelwald First Ski Day", location: "Grindelwald First", status: "Confirmed", notes: "Ski passes and equipment rental included" },
      { id: "e57", type: "dining", date: "2027-01-17", time: "07:30 PM", title: "Fondue Evening at Bärghüttli", location: "Interlaken Old Town", status: "Confirmed", notes: "Traditional Swiss cheese fondue" },
      { id: "e58", type: "activity", date: "2027-01-18", time: "10:00 AM", title: "Paragliding over Lake Brienz", location: "Interlaken", status: "Proposed", notes: "Weather dependent, tandem flights" },
      { id: "e59", type: "activity", date: "2027-01-19", time: "09:00 AM", title: "Lauterbrunnen Valley & Trümmelbach Falls", location: "Lauterbrunnen", status: "Confirmed" },
      { id: "e60", type: "dining", date: "2027-01-20", time: "07:00 PM", title: "Farewell Dinner at Restaurant Piz Gloria", location: "Schilthorn Summit, 2,970m", status: "Confirmed", notes: "Revolving restaurant, cable car access" },
      { id: "e61", type: "flight", date: "2027-01-22", time: "11:30 AM", title: "SWISS — LX396", location: "ZRH to MAN", airline: "SWISS", flightNum: "LX396", terminal: "T1", duration: "1h 55m", status: "Confirmed" },
    ]
  },
  {
    id: "8",
    name: "New York Urban FAM",
    attendees: "Product Managers",
    start: "2026-05-05",
    end: "2026-05-09",
    status: "Published",
    image: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=1000&auto=format&fit=crop",
    events: [
      { id: "e62", type: "flight", date: "2026-05-05", time: "10:00 AM", title: "Virgin Atlantic — VS3", location: "MAN to JFK", airline: "Virgin Atlantic", flightNum: "VS3", terminal: "T2", arrTerminal: "T4", duration: "8h 10m", status: "Confirmed" },
      { id: "e63", type: "hotel", date: "2026-05-05", time: "05:00 PM", title: "The Standard, High Line", location: "Meatpacking District, NYC", checkin: "4:00 PM", checkout: "11:00 AM", roomType: "Hudson River View King", confNumber: "SHL-65023", status: "Confirmed" },
      { id: "e64", type: "activity", date: "2026-05-06", time: "09:00 AM", title: "High Line Walk & Chelsea Market", location: "Chelsea, Manhattan", status: "Confirmed" },
      { id: "e65", type: "activity", date: "2026-05-06", time: "02:00 PM", title: "Brooklyn Bridge & DUMBO Tour", location: "Brooklyn Bridge, NYC", status: "Confirmed" },
      { id: "e66", type: "dining", date: "2026-05-06", time: "07:30 PM", title: "Dinner at Le Bernardin", location: "Midtown West, Manhattan", status: "Confirmed", notes: "3 Michelin stars, smart casual" },
      { id: "e67", type: "activity", date: "2026-05-07", time: "08:00 AM", title: "Statue of Liberty & Ellis Island", location: "Liberty Island, NYC", status: "Confirmed", notes: "Crown access tickets, early boarding" },
      { id: "e68", type: "activity", date: "2026-05-07", time: "04:00 PM", title: "Top of the Rock Observation Deck", location: "Rockefeller Center, Manhattan", status: "Confirmed" },
      { id: "e69", type: "dining", date: "2026-05-07", time: "08:00 PM", title: "Broadway Show — The Great Gatsby", location: "Broadway Theatre, Manhattan", status: "Confirmed", notes: "Orchestra seats, pre-show drinks included" },
      { id: "e70", type: "activity", date: "2026-05-08", time: "10:00 AM", title: "Central Park Guided Bike Tour", location: "Central Park, Manhattan", status: "Confirmed" },
      { id: "e71", type: "flight", date: "2026-05-09", time: "10:30 PM", title: "Virgin Atlantic — VS4", location: "JFK to MAN", airline: "Virgin Atlantic", flightNum: "VS4", terminal: "T4", duration: "7h 05m", status: "Confirmed" },
    ]
  }
];

export default function App() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("grid");
  const [theme, setTheme] = useState<Theme>("dark");
  const [activeTab, setActiveTab] = useState("Dashboard");
  
  // Cache Reset to v3
  const [trips, setTrips] = useState<Trip[]>(() => {
    const saved = localStorage.getItem("daf-adventures-v3");
    if (!saved) return INITIAL_TRIPS;
    try {
      return JSON.parse(saved);
    } catch (e) {
      return INITIAL_TRIPS;
    }
  });
  
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [isEditPanelOpen, setIsEditPanelOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<TravelEvent | null>(null);
  const [showMap, setShowMap] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notification, setNotification] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  
  // New Trip Modal State
  const [isNewTripOpen, setIsNewTripOpen] = useState(false);
  const [newTripData, setNewTripData] = useState<{
    name: string;
    attendees: string;
    dateRange: DateRange | undefined;
    image: string;
  }>({ 
    name: "", 
    attendees: "", 
    dateRange: undefined,
    image: ""
  });

  useEffect(() => { 
    localStorage.setItem("daf-adventures-v3", JSON.stringify(trips)); 
  }, [trips]);
  
  // Sync theme class on mount only (toggle handler applies it immediately)
  useEffect(() => {
    const html = window.document.documentElement;
    html.classList.remove("light", "dark");
    html.classList.add(theme);
    html.style.colorScheme = theme;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const activeTrip = useMemo(() => trips.find(t => t.id === activeTripId) || null, [trips, activeTripId]);
  
  const filteredTrips = useMemo(() => {
    return trips.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.attendees.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [trips, searchQuery]);

  const handleCreateTripSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTripData.dateRange?.from || !newTripData.dateRange?.to) {
      setNotification({ message: "Please select travel dates", type: 'error' });
      return;
    }

    const newTrip: Trip = { 
      id: Date.now().toString(), 
      name: newTripData.name, 
      attendees: newTripData.attendees, 
      start: format(newTripData.dateRange.from, "yyyy-MM-dd"), 
      end: format(newTripData.dateRange.to, "yyyy-MM-dd"), 
      status: "Draft", 
      image: newTripData.image || "https://images.unsplash.com/photo-1488646953014-85cb44e25828?q=80&w=1000&auto=format&fit=crop", 
      events: [] 
    };
    
    setTrips([newTrip, ...trips]);
    setIsNewTripOpen(false);
    setNewTripData({ name: "", attendees: "", dateRange: undefined, image: "" });
    setNotification({ message: "Trip created successfully", type: 'success' });
  };

  const handleDeleteTrip = (id: string) => { 
    setTrips(prev => prev.filter(t => t.id !== id)); 
    setNotification({ message: "Trip removed", type: 'success' }); 
  };

  const handleOpenTrip = (trip: Trip) => { 
    setActiveTripId(trip.id); 
    setCurrentView("workspace"); 
  };

  const handleAddEvent = (type: TravelEvent["type"] = "activity") => { 
    setEditingEvent({ 
      id: Date.now().toString(), 
      type, 
      date: activeTrip?.start || new Date().toISOString().split('T')[0],
      title: "", 
      time: "12:00 PM", 
      location: "", 
      status: "Proposed" 
    }); 
    setIsEditPanelOpen(true); 
  };

  const handleEditEvent = (event: TravelEvent) => { 
    setEditingEvent({ ...event }); 
    setIsEditPanelOpen(true); 
  };

  const handleSaveEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEvent || !activeTripId) return;
    setTrips(prev => prev.map(trip => {
      if (trip.id !== activeTripId) return trip;
      const eventExists = trip.events.some(e => e.id === editingEvent.id);
      const newEvents = eventExists 
        ? trip.events.map(e => e.id === editingEvent.id ? editingEvent : e) 
        : [...trip.events, editingEvent];
      return { ...trip, events: newEvents };
    }));
    setIsEditPanelOpen(false);
    setEditingEvent(null);
    setNotification({ message: "Event saved", type: 'success' });
  };

  const handleDeleteEvent = (eventId: string) => {
    if (!activeTripId) return;
    setTrips(prev => prev.map(trip => {
      if (trip.id !== activeTripId) return trip;
      return { ...trip, events: trip.events.filter(e => e.id !== eventId) };
    }));
    setNotification({ message: "Event deleted", type: 'success' });
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    const html = window.document.documentElement;
    html.classList.add("theme-switching");
    html.classList.remove("light", "dark");
    html.classList.add(next);
    html.style.colorScheme = next;
    setTheme(next);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        html.classList.remove("theme-switching");
      });
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#050505] text-slate-900 dark:text-white font-sans antialiased selection:bg-[#0bd2b5]/30 overflow-hidden">
      <div className="relative z-10 flex min-h-screen">
        {currentView === "dashboard" ? (
          <>
            <Sidebar activeTab={activeTab} onNavigate={setActiveTab} />
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
              {(activeTab === "Dashboard" || activeTab === "Trips") ? (
                <TripsDashboard 
                  trips={filteredTrips} 
                  displayMode={displayMode} 
                  theme={theme} 
                  onToggleTheme={toggleTheme} 
                  onDisplayModeChange={setDisplayMode} 
                  onOpenTrip={handleOpenTrip} 
                  onCreateTrip={() => setIsNewTripOpen(true)} 
                  onDeleteTrip={handleDeleteTrip} 
                  searchQuery={searchQuery} 
                  onSearchChange={setSearchQuery} 
                />
              ) : (
                <ModulePlaceholder tabName={activeTab} />
              )}
            </div>
          </>
        ) : (
          <ItineraryWorkspace 
            trip={activeTrip!} 
            theme={theme} 
            onToggleTheme={toggleTheme} 
            onBack={() => { setCurrentView("dashboard"); setShowMap(false); }} 
            onEditEvent={handleEditEvent} 
            onAddEvent={handleAddEvent} 
            onDeleteEvent={handleDeleteEvent}
            showMap={showMap} 
            onToggleMap={() => setShowMap(!showMap)} 
            onPublish={() => setNotification({ message: "Trip published successfully", type: 'success' })} 
          />
        )}
      </div>

      {notification && (
        <div className="fixed bottom-8 right-8 z-[100] animate-in slide-in-from-bottom-4 duration-300">
          <div className="flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl border border-slate-200 dark:border-[#1f1f1f] backdrop-blur-xl bg-white dark:bg-[#111111]">
            {notification.type === 'success' ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <AlertCircle className="h-5 w-5 text-destructive" />}
            <span className="text-sm font-semibold">{notification.message}</span>
          </div>
        </div>
      )}

      {/* New Trip Modal */}
      <Dialog open={isNewTripOpen} onOpenChange={setIsNewTripOpen}>
        <DialogContent className="max-w-2xl bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] p-10 shadow-2xl">
          <DialogHeader className="space-y-2 mb-8 text-left">
            <DialogTitle className="text-3xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">CREATE NEW TRIP</DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-[#888888] font-medium uppercase text-[10px] tracking-[0.2em]">Set up the details for your team's upcoming travel experience.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateTripSubmit} className="space-y-8">
            <div className="space-y-3">
              <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Itinerary Title</Label>
              <Input 
                required 
                value={newTripData.name} 
                onChange={e => setNewTripData({...newTripData, name: e.target.value})} 
                placeholder="e.g., Kenya Fam Trip" 
                className="h-16 text-2xl font-black italic uppercase tracking-tighter bg-transparent border-0 border-b border-slate-200 dark:border-[#1f1f1f] rounded-none focus-visible:ring-0 focus-visible:border-[#0bd2b5] px-1 transition-all placeholder:text-slate-500/20 dark:placeholder:text-[#888888]/20"
              />
            </div>

            <div className="grid grid-cols-2 gap-8">
              <div className="space-y-3">
                <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Primary Attendee / Team</Label>
                <div className="relative">
                  <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888]" />
                  <Input 
                    required 
                    value={newTripData.attendees} 
                    onChange={e => setNewTripData({...newTripData, attendees: e.target.value})} 
                    placeholder="e.g., Senior Agents" 
                    className="h-14 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-semibold text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]"
                  />
                </div>
              </div>
              <div className="space-y-3">
                <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Travel Dates</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full h-14 justify-start text-left font-semibold bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl hover:bg-white dark:hover:bg-[#111111] transition-all px-4",
                        !newTripData.dateRange && "text-slate-500 dark:text-[#888888]"
                      )}
                    >
                      <LucideCalendar className="mr-3 h-4 w-4 text-[#0bd2b5]" />
                      {newTripData.dateRange?.from ? (
                        newTripData.dateRange.to ? (
                          <>
                            {format(newTripData.dateRange.from, "MMM d")} - {format(newTripData.dateRange.to, "MMM d, yyyy")}
                          </>
                        ) : (
                          format(newTripData.dateRange.from, "MMM d, yyyy")
                        )
                      ) : (
                        <span className="opacity-50">Select travel dates...</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 border border-slate-200 dark:border-[#1f1f1f] shadow-2xl rounded-[1.5rem] bg-white dark:bg-[#111111]" align="start">
                    <Calendar
                      initialFocus
                      mode="range"
                      defaultMonth={newTripData.dateRange?.from}
                      selected={newTripData.dateRange}
                      onSelect={(range) => setNewTripData({ ...newTripData, dateRange: range })}
                      numberOfMonths={2}
                      className="p-4"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888] ml-1">Cover Image URL (Optional)</Label>
              <div className="relative">
                <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888]" />
                <Input 
                  value={newTripData.image} 
                  onChange={e => setNewTripData({...newTripData, image: e.target.value})} 
                  placeholder="https://images.unsplash.com/..." 
                  className="h-14 pl-12 bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl font-medium text-slate-900 dark:text-white focus-visible:ring-2 focus-visible:ring-[#0bd2b5]/20 focus-visible:border-[#0bd2b5]"
                />
              </div>
            </div>

            <DialogFooter className="pt-4">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => setIsNewTripOpen(false)}
                className="rounded-2xl h-14 px-8 font-bold text-slate-500 dark:text-[#888888] hover:bg-slate-100 dark:hover:bg-[#1f1f1f]"
              >
                CANCEL
              </Button>
              <Button 
                type="submit"
                className="rounded-2xl h-14 px-10 font-bold bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black shadow-xl shadow-[#0bd2b5]/20 transition-all ml-2 uppercase tracking-wider"
              >
                Create Itinerary
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Event Edit Panel */}
      <Sheet open={isEditPanelOpen} onOpenChange={setIsEditPanelOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] p-0 border-l border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] shadow-2xl overflow-hidden flex flex-col">
          <form onSubmit={handleSaveEvent} className="flex flex-col h-full">
            <SheetHeader className="p-6 bg-white dark:bg-[#111111] border-b border-slate-200 dark:border-[#1f1f1f] text-left">
              <SheetTitle className="text-xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">{editingEvent?.title ? "Edit Travel Event" : "Add Event to Itinerary"}</SheetTitle>
              <SheetDescription className="text-slate-500 dark:text-[#888888] text-[9px] font-bold uppercase tracking-[0.3em] mt-1">Fill in the travel details for this event.</SheetDescription>
            </SheetHeader>
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-8">
                <div className="space-y-3">
                  <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Event Category</Label>
                  <div className="grid grid-cols-4 gap-2 bg-slate-50 dark:bg-[#050505] p-1.5 rounded-xl border border-slate-200 dark:border-[#1f1f1f]">
                    {[
                      { id: 'flight', label: 'Flight', icon: Plane },
                      { id: 'hotel', label: 'Hotel', icon: Hotel },
                      { id: 'activity', label: 'Activity', icon: Compass },
                      { id: 'dining', label: 'Dining', icon: Utensils }
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setEditingEvent(prev => prev ? {...prev, type: cat.id as any} : null)}
                        className={`flex flex-col items-center justify-center py-3 rounded-lg transition-all gap-1.5 border ${editingEvent?.type === cat.id ? 'bg-white dark:bg-[#111111] text-[#0bd2b5] shadow-sm border-[#0bd2b5]/30' : 'border-transparent text-slate-400 dark:text-[#666] hover:text-slate-600 dark:hover:text-[#aaa]'}`}
                      >
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${editingEvent?.type === cat.id ? 'bg-[#0bd2b5]/10' : ''}`}>
                          <cat.icon className="h-4 w-4" />
                        </div>
                        <span className="text-[8px] font-bold uppercase tracking-wider">{cat.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-6">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Event Title</Label>
                      <Input value={editingEvent?.title || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, title: e.target.value} : null)} placeholder="e.g., Private Maasai Mara Flight" className="rounded-lg h-11 text-sm font-medium bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Date</Label>
                        <Input type="date" value={editingEvent?.date || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, date: e.target.value} : null)} className="rounded-lg h-11 text-sm font-medium bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Start Time</Label>
                        <Input value={editingEvent?.time || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, time: e.target.value} : null)} placeholder="10:30 AM" className="rounded-lg h-11 text-sm font-medium bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Location / Address</Label>
                      <Input value={editingEvent?.location || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, location: e.target.value} : null)} placeholder="Airport code or Street Address" className="rounded-lg h-11 text-sm font-medium bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                    </div>
                  </div>
                  <Separator className="bg-slate-200 dark:bg-[#1f1f1f]" />
                  <div className="bg-slate-50/50 dark:bg-[#050505]/50 p-4 rounded-xl space-y-4 border border-slate-200 dark:border-[#1f1f1f]">
                    {editingEvent?.type === 'flight' && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Airline</Label>
                            <Input value={editingEvent?.airline || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, airline: e.target.value} : null)} className="rounded-lg h-10 text-sm bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Flight Number</Label>
                            <Input value={editingEvent?.flightNum || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, flightNum: e.target.value} : null)} className="rounded-lg h-10 text-sm bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Dep Terminal</Label>
                            <Input value={editingEvent?.terminal || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, terminal: e.target.value} : null)} className="rounded-lg h-10 text-sm bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Arr Terminal</Label>
                            <Input value={editingEvent?.arrTerminal || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, arrTerminal: e.target.value} : null)} className="rounded-lg h-10 text-sm bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                          </div>
                        </div>
                      </>
                    )}
                    {editingEvent?.type === 'hotel' && (
                      <>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Check-in</Label>
                            <Input value={editingEvent?.checkin || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, checkin: e.target.value} : null)} className="rounded-lg h-10 text-sm bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Check-out</Label>
                            <Input value={editingEvent?.checkout || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, checkout: e.target.value} : null)} className="rounded-lg h-10 text-sm bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Room Type</Label>
                            <Input value={editingEvent?.roomType || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, roomType: e.target.value} : null)} className="rounded-lg h-10 text-sm bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Confirmation #</Label>
                            <Input value={editingEvent?.confNumber || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, confNumber: e.target.value} : null)} className="rounded-lg h-10 text-sm bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                          </div>
                        </div>
                      </>
                    )}
                    <div className="space-y-2">
                      <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Image URL</Label>
                      <Input value={editingEvent?.image || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, image: e.target.value} : null)} placeholder="https://..." className="rounded-lg h-10 text-sm bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-500 dark:text-[#888888]">Agent Notes (Internal)</Label>
                      <Textarea value={editingEvent?.notes || ""} onChange={e => setEditingEvent(prev => prev ? {...prev, notes: e.target.value} : null)} className="rounded-lg min-h-[100px] text-sm font-medium bg-slate-50 dark:bg-[#050505] border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white" />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
            <div className="p-6 bg-white dark:bg-[#111111] border-t border-slate-200 dark:border-[#1f1f1f] flex items-center gap-3">
              <Button type="button" variant="ghost" className="flex-1 h-11 rounded-lg bg-slate-100 dark:bg-[#1f1f1f] hover:bg-slate-900/10 dark:hover:bg-white/10 text-slate-900 dark:text-white font-bold uppercase tracking-wider text-xs" onClick={() => setIsEditPanelOpen(false)}>Cancel</Button>
              <Button type="submit" className="flex-1 h-11 rounded-lg bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black font-bold uppercase tracking-wider text-xs shadow-lg shadow-[#0bd2b5]/20">Save Event</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Sidebar({ activeTab, onNavigate }: { activeTab: string, onNavigate: (tab: string) => void }) {
  const items = [ 
    { icon: <LayoutDashboard className="h-5 w-5" />, label: "Dashboard" }, 
    { icon: <Briefcase className="h-5 w-5" />, label: "Trips" }, 
    { icon: <Users className="h-5 w-5" />, label: "Travelers" }, 
    { icon: <Globe className="h-5 w-5" />, label: "Destinations" }, 
    { icon: <PieChart className="h-5 w-5" />, label: "Reports" } 
  ];
  return (
    <aside className="w-64 bg-white dark:bg-[#111111] border-r border-slate-200 dark:border-[#1f1f1f] flex flex-col hidden xl:flex shadow-sm relative z-50">
      <div className="p-8 pb-10">
        <div className="flex items-center gap-3 group cursor-pointer">
          <div className="h-10 w-10 bg-[#0bd2b5] rounded-lg flex items-center justify-center shadow-lg shadow-[#0bd2b5]/20">
            <Globe className="text-black h-5 w-5" />
          </div>
          <span className="text-xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white leading-none">DAF ADVENTURES</span>
        </div>
      </div>
      <nav className="flex-1 px-4 space-y-2">
        <p className="px-4 text-[9px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em] mb-6">MENU</p>
        {items.map((item) => (
          <button 
            key={item.label} 
            onClick={() => onNavigate(item.label)}
            className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-200 group ${item.label === activeTab ? 'bg-[#0bd2b5] text-slate-900 dark:text-black shadow-lg shadow-[#0bd2b5]/20' : 'text-slate-500 dark:text-[#888888] hover:bg-slate-50 dark:hover:bg-[#050505] hover:text-slate-900 dark:hover:text-white'}`}
          >
            <div className="flex items-center gap-3">
              <span className={item.label === activeTab ? 'text-slate-900 dark:text-black' : 'group-hover:text-[#0bd2b5]'}>{item.icon}</span>
              <span className="text-xs font-bold uppercase tracking-wider">{item.label}</span>
            </div>
            {item.label === activeTab && <ChevronRight className="h-4 w-4" />}
          </button>
        ))}
      </nav>
      <div className="p-6 mt-auto border-t border-slate-200 dark:border-[#1f1f1f]">
        <div className="bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl p-4 space-y-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#0bd2b5] text-slate-900 dark:text-black flex items-center justify-center font-black text-xs italic">AM</div>
            <div>
              <p className="text-xs font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">Ash Murray</p>
              <p className="text-[9px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-wider leading-none mt-0.5">Lead Designer</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full h-10 justify-start gap-2 text-slate-500 dark:text-[#888888] hover:text-destructive hover:bg-destructive/5 rounded-xl px-2">
            <LogOut className="h-3.5 w-3.5" /> 
            <span className="text-[9px] font-bold uppercase tracking-[0.2em]">Sign Out</span>
          </Button>
        </div>
      </div>
    </aside>
  );
}

function TripsDashboard({ trips, displayMode, theme, onToggleTheme, onDisplayModeChange, onOpenTrip, onCreateTrip, onDeleteTrip, searchQuery, onSearchChange }: { trips: Trip[], displayMode: DisplayMode, theme: Theme, onToggleTheme: () => void, onDisplayModeChange: (mode: DisplayMode) => void, onOpenTrip: (trip: Trip) => void, onCreateTrip: () => void, onDeleteTrip: (id: string) => void, searchQuery: string, onSearchChange: (val: string) => void }) {
  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-[#050505] relative">
      <header className="h-20 shrink-0 border-b border-slate-200 dark:border-[#1f1f1f] px-10 flex items-center justify-between sticky top-0 z-40 bg-slate-50/80 dark:bg-[#050505]/80 backdrop-blur-md">
        <div className="flex-1 flex items-center gap-8">
          <div className="max-w-md w-full relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 dark:text-[#888888] group-focus-within:text-[#0bd2b5] transition-colors" />
            <input 
              value={searchQuery} 
              onChange={e => onSearchChange(e.target.value)} 
              placeholder="SEARCH TRIPS..." 
              className="pl-12 h-12 bg-white dark:bg-[#111111] border-none rounded-full text-slate-900 dark:text-white placeholder:text-slate-500/40 dark:placeholder:text-[#888888]/40 focus:outline-none focus:ring-2 focus:ring-[#0bd2b5]/20 w-full text-[10px] font-bold tracking-widest uppercase shadow-inner" 
            />
          </div>
        </div>
        <div className="flex items-center gap-6">
          <button onClick={onToggleTheme} className="h-11 w-11 rounded-full bg-white dark:bg-[#111111] hover:bg-slate-100 dark:hover:bg-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] transition-all border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center cursor-pointer shadow-sm">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-full bg-white dark:bg-[#111111] hover:bg-slate-100 dark:hover:bg-[#1f1f1f] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] relative border border-slate-200 dark:border-[#1f1f1f] shadow-sm">
            <Bell className="h-4 w-4" />
            <div className="absolute top-3 right-3 h-1.5 w-1.5 bg-[#0bd2b5] rounded-full ring-2 ring-white dark:ring-[#050505]" />
          </Button>
          <div className="h-8 w-px bg-slate-200 dark:bg-[#1f1f1f]" />
          <Button 
            onClick={onCreateTrip} 
            className="rounded-full bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black font-bold h-12 px-8 shadow-[0_0_20px_rgba(11,210,181,0.4)] transition-all gap-2 text-xs uppercase tracking-wider"
          >
            <Plus className="h-4 w-4" /> NEW TRIP
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-7xl mx-auto w-full space-y-16 px-10 py-10">
          <div className="space-y-8">
            <h2 className="text-5xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">Trip Manager</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <StatCard label="TOTAL TRIPS" value={trips.length.toString()} sub="ACTIVE" icon={<Compass className="h-5 w-5" />} accent />
              <StatCard label="DESTINATIONS" value="14" sub="WORLDWIDE" icon={<Globe className="h-5 w-5" />} />
              <StatCard label="DRAFTS" value={trips.filter(t => t.status === 'Draft').length.toString()} sub="PENDING REVIEW" icon={<Zap className="h-5 w-5" />} />
              <StatCard label="UPCOMING" value="2" sub="NEXT 7 DAYS" icon={<Plane className="h-5 w-5" />} />
            </div>
          </div>

          {/* Quick Actions */}
          <div className="space-y-5">
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-slate-400 dark:text-[#555]">QUICK ACTIONS</span>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button onClick={onCreateTrip} className="group flex items-center gap-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl p-5 hover:border-[#0bd2b5]/40 transition-colors text-left cursor-pointer">
                <div className="h-11 w-11 rounded-xl bg-[#0bd2b5]/10 text-[#0bd2b5] flex items-center justify-center shrink-0 group-hover:bg-[#0bd2b5] group-hover:text-black transition-colors">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">Create Trip</p>
                  <p className="text-[10px] text-slate-400 dark:text-[#555] mt-0.5">Start a new itinerary from scratch</p>
                </div>
              </button>
              <button className="group flex items-center gap-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl p-5 hover:border-[#0bd2b5]/40 transition-colors text-left cursor-pointer">
                <div className="h-11 w-11 rounded-xl bg-[#0bd2b5]/10 text-[#0bd2b5] flex items-center justify-center shrink-0 group-hover:bg-[#0bd2b5] group-hover:text-black transition-colors">
                  <ExternalLink className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">Import Itinerary</p>
                  <p className="text-[10px] text-slate-400 dark:text-[#555] mt-0.5">Upload from file or paste a link</p>
                </div>
              </button>
              <button className="group flex items-center gap-4 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl p-5 hover:border-[#0bd2b5]/40 transition-colors text-left cursor-pointer">
                <div className="h-11 w-11 rounded-xl bg-[#0bd2b5]/10 text-[#0bd2b5] flex items-center justify-center shrink-0 group-hover:bg-[#0bd2b5] group-hover:text-black transition-colors">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide">Invite Team</p>
                  <p className="text-[10px] text-slate-400 dark:text-[#555] mt-0.5">Add collaborators to your workspace</p>
                </div>
              </button>
            </div>
          </div>

          {/* Upcoming Timeline + Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Upcoming Timeline - wider */}
            <div className="lg:col-span-3 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#0bd2b5]/10 text-[#0bd2b5] flex items-center justify-center">
                    <LucideCalendar className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Upcoming</span>
                </div>
                <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 dark:text-[#555]">NEXT 30 DAYS</span>
              </div>
              <div className="space-y-1">
                {trips
                  .filter(t => t.status !== 'Draft')
                  .sort((a, b) => a.start.localeCompare(b.start))
                  .slice(0, 4)
                  .map((trip, i) => {
                    const startDate = new Date(trip.start);
                    const today = new Date();
                    const daysUntil = Math.max(0, Math.ceil((startDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
                    return (
                      <div key={trip.id} onClick={() => onOpenTrip(trip)} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-[#0a0a0a] transition-colors cursor-pointer group">
                        <div className="relative">
                          <div className={`h-10 w-10 rounded-lg overflow-hidden border ${i === 0 ? 'border-[#0bd2b5]' : 'border-slate-200 dark:border-[#1f1f1f]'}`}>
                            <img src={trip.image} alt="" className="h-full w-full object-cover" />
                          </div>
                          {i === 0 && <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 bg-[#0bd2b5] rounded-full ring-2 ring-white dark:ring-[#111111]" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-[#0bd2b5] transition-colors">{trip.name}</p>
                          <p className="text-[10px] text-slate-400 dark:text-[#555] mt-0.5">{trip.attendees}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-black italic tracking-tighter ${daysUntil <= 7 ? 'text-[#0bd2b5]' : 'text-slate-500 dark:text-[#666]'}`}>
                            {daysUntil === 0 ? 'TODAY' : daysUntil === 1 ? 'TOMORROW' : `${daysUntil}d`}
                          </p>
                          <p className="text-[9px] text-slate-400 dark:text-[#444] mt-0.5 uppercase tracking-wider">
                            {startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                }
              </div>
            </div>

            {/* Recent Activity */}
            <div className="lg:col-span-2 bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-lg bg-[#0bd2b5]/10 text-[#0bd2b5] flex items-center justify-center">
                    <Activity className="h-4 w-4" />
                  </div>
                  <span className="text-sm font-bold uppercase tracking-wider text-slate-900 dark:text-white">Activity</span>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { action: "Trip created", detail: "Kenya Luxury Safari", time: "2 hours ago", icon: <Plus className="h-3 w-3" /> },
                  { action: "Itinerary published", detail: "Maldives Retreat", time: "5 hours ago", icon: <CheckCircle2 className="h-3 w-3" /> },
                  { action: "Event added", detail: "Flight QR28 to Doha", time: "1 day ago", icon: <Plane className="h-3 w-3" /> },
                  { action: "Team invited", detail: "EU Sales Team", time: "2 days ago", icon: <Users className="h-3 w-3" /> },
                  { action: "Trip created", detail: "Japan Discovery", time: "3 days ago", icon: <Plus className="h-3 w-3" /> },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <div className="h-7 w-7 rounded-lg bg-slate-50 dark:bg-[#0a0a0a] border border-slate-100 dark:border-[#1f1f1f] flex items-center justify-center text-slate-400 dark:text-[#555] shrink-0 mt-0.5">
                      {item.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-white">{item.action}</p>
                      <p className="text-[10px] text-slate-400 dark:text-[#555] truncate">{item.detail}</p>
                    </div>
                    <span className="text-[9px] text-slate-300 dark:text-[#444] shrink-0 mt-0.5 uppercase tracking-wider">{item.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-10 pb-20">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#1f1f1f] pb-8">
              <div className="flex items-center gap-6">
                <h3 className="text-3xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">ALL TRIPS</h3>
                <Badge className="rounded-full px-4 py-1 text-[10px] font-bold bg-white dark:bg-[#111111] text-[#0bd2b5] border border-slate-200 dark:border-[#1f1f1f] uppercase tracking-widest shadow-sm">{trips.length} Trips</Badge>
              </div>
              <div className="flex bg-white dark:bg-[#111111] p-1.5 rounded-full border border-slate-200 dark:border-[#1f1f1f] shadow-sm">
                <Button variant="ghost" size="icon" onClick={() => onDisplayModeChange("grid")} className={`h-9 w-9 rounded-full transition-all ${displayMode === 'grid' ? 'bg-[#0bd2b5] text-slate-900 dark:text-black shadow-lg' : 'text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white'}`}><LayoutGrid className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" onClick={() => onDisplayModeChange("list")} className={`h-9 w-9 rounded-full transition-all ${displayMode === 'list' ? 'bg-[#0bd2b5] text-slate-900 dark:text-black shadow-lg' : 'text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white'}`}><List className="h-4 w-4" /></Button>
              </div>
            </div>
            {displayMode === "grid" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-10">
                {trips.map((trip) => (
                  <div key={trip.id} className="group bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] overflow-hidden hover:border-[#0bd2b5]/40 flex flex-col shadow-xl transition-all duration-300 min-h-[480px]">
                    <div className="relative h-[65%] w-full overflow-hidden cursor-pointer" onClick={() => onOpenTrip(trip)}>
                      <img src={trip.image} alt={trip.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[#111111] via-[#111111]/40 to-transparent" />
                      <div className="absolute top-6 left-6 flex">
                        <Badge className={`border-none rounded-full px-3 py-1 text-[9px] font-bold text-slate-900 dark:text-black uppercase tracking-widest ${trip.status === 'Published' ? 'bg-emerald-400' : 'bg-[#0bd2b5]'}`}>{trip.status}</Badge>
                      </div>
                      <h3 className="absolute bottom-6 left-6 right-6 text-white font-black italic uppercase text-2xl leading-none tracking-tighter drop-shadow-2xl">{trip.name}</h3>
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between bg-white dark:bg-[#111111]">
                      <div className="flex items-center gap-4">
                        <div className="h-10 w-10 rounded-full bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center text-[#0bd2b5] font-black italic text-xs uppercase shadow-inner">{(trip.attendees || "T").split(' ').map(n => n[0]).join('')}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[9px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em] leading-none mb-1.5">ATTENDEES</p>
                          <p className="text-sm font-bold text-slate-900 dark:text-white truncate leading-none uppercase tracking-wide">{trip.attendees || "Team"}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-6 border-t border-slate-200 dark:border-[#1f1f1f]">
                        <div className="flex items-center gap-2 text-slate-500 dark:text-[#888888]">
                          <LucideCalendar className="h-3.5 w-3.5 text-[#0bd2b5]" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">{trip.start}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => onDeleteTrip(trip.id)} className="h-9 w-9 rounded-xl bg-slate-50 dark:bg-[#050505] text-slate-500 dark:text-[#888888] hover:bg-destructive/10 hover:text-destructive transition-all shadow-sm"><Trash2 className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => onOpenTrip(trip)} className="h-9 w-9 rounded-xl bg-slate-50 dark:bg-[#050505] text-[#0bd2b5] hover:bg-[#0bd2b5] hover:text-slate-900 dark:hover:text-black transition-all shadow-md"><ArrowUpRight className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                <div onClick={onCreateTrip} className="group bg-white dark:bg-[#111111] rounded-[2rem] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] flex flex-col items-center justify-center py-20 text-slate-500 dark:text-[#888888] hover:border-[#0bd2b5] hover:text-[#0bd2b5] transition-all cursor-pointer shadow-none min-h-[480px]">
                  <div className="h-20 w-20 rounded-full bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform group-hover:shadow-[0_0_30px_rgba(11,210,181,0.2)] shadow-sm">
                    <Plus className="h-10 w-10" />
                  </div>
                  <p className="font-bold text-[10px] uppercase tracking-[0.3em]">CREATE NEW TRIP</p>
                </div>
              </div>
            ) : (
              <div className="bg-white dark:bg-[#111111] rounded-[2rem] border border-slate-200 dark:border-[#1f1f1f] overflow-hidden shadow-2xl">
                <Table>
                  <TableHeader className="bg-slate-50 dark:bg-[#050505]">
                    <TableRow className="hover:bg-transparent border-slate-200 dark:border-[#1f1f1f]">
                      <TableHead className="pl-8 py-6 text-[9px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">PREVIEW</TableHead>
                      <TableHead className="text-[9px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">DESTINATION</TableHead>
                      <TableHead className="text-[9px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">ATTENDEES</TableHead>
                      <TableHead className="text-[9px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">TIMELINE</TableHead>
                      <TableHead className="text-right pr-8 text-[9px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.3em]">ACTIONS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {trips.map((trip) => (
                      <TableRow key={trip.id} className="group hover:bg-slate-50 dark:hover:bg-[#050505] transition-colors cursor-pointer border-slate-200 dark:border-[#1f1f1f] h-24" onClick={() => onOpenTrip(trip)}>
                        <TableCell className="pl-8 py-2">
                          <div className="h-14 w-14 rounded-xl overflow-hidden border border-slate-200 dark:border-[#1f1f1f]">
                            <img src={trip.image} alt={trip.name} className="h-full w-full object-cover" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-black italic uppercase tracking-tighter text-slate-900 dark:text-white text-lg group-hover:text-[#0bd2b5] transition-colors leading-none">{trip.name}</span>
                            <Badge className={`w-fit text-[8px] font-bold px-2 py-0.5 h-auto border-none mt-2 uppercase tracking-tighter text-slate-900 dark:text-black ${trip.status === 'Published' ? 'bg-emerald-400' : 'bg-[#0bd2b5]'}`}>{trip.status}</Badge>
                          </div>
                        </TableCell>
                        <TableCell><span className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider">{trip.attendees || "Team"}</span></TableCell>
                        <TableCell className="text-slate-500 dark:text-[#888888]"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest"><LucideCalendar className="h-3.5 w-3.5 text-[#0bd2b5]" />{trip.start}</div></TableCell>
                        <TableCell className="text-right pr-8">
                          <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-end gap-3">
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white transition-all shadow-sm"><ExternalLink className="h-4 w-4" /></Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] transition-all focus:outline-none flex items-center justify-center cursor-pointer border border-transparent hover:border-slate-200 dark:hover:border-[#1f1f1f] shadow-sm"><MoreVertical className="h-4 w-4" /></button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white rounded-xl shadow-2xl p-1" align="end">
                                <DropdownMenuItem onClick={() => onDeleteTrip(trip.id)} className="gap-2 p-2 rounded-lg font-bold text-[10px] uppercase tracking-wider text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> DELETE</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, icon, accent }: { label: string, value: string, sub: string, icon: React.ReactNode, accent?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border p-6 group hover:-translate-y-0.5 transition-transform duration-300 ${accent ? 'bg-[#0bd2b5] border-[#0bd2b5] shadow-lg shadow-[#0bd2b5]/20' : 'bg-white dark:bg-[#111111] border-slate-200 dark:border-[#1f1f1f] shadow-sm'}`}>
      <div className="flex items-start justify-between">
        <div className="space-y-3">
          <span className={`text-[9px] font-bold uppercase tracking-[0.25em] ${accent ? 'text-black/50' : 'text-slate-400 dark:text-[#666]'}`}>{label}</span>
          <p className={`text-3xl font-black italic tracking-tighter leading-none ${accent ? 'text-black' : 'text-slate-900 dark:text-white'}`}>{value}</p>
        </div>
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${accent ? 'bg-black/10 text-black' : 'bg-slate-50 dark:bg-[#0a0a0a] text-[#0bd2b5] border border-slate-100 dark:border-[#1f1f1f]'}`}>
          {icon}
        </div>
      </div>
      <div className={`mt-4 pt-4 border-t ${accent ? 'border-black/10' : 'border-slate-100 dark:border-[#1a1a1a]'}`}>
        <span className={`text-[9px] font-bold uppercase tracking-[0.2em] ${accent ? 'text-black/40' : 'text-slate-400 dark:text-[#555]'}`}>{sub}</span>
      </div>
    </div>
  );
}

function ItineraryWorkspace({ trip, theme, onToggleTheme, onBack, onEditEvent, onAddEvent, onDeleteEvent, showMap, onToggleMap, onPublish }: { trip: Trip, theme: Theme, onToggleTheme: () => void, onBack: () => void, onEditEvent: (event: TravelEvent) => void, onAddEvent: (type?: TravelEvent["type"]) => void, onDeleteEvent: (id: string) => void, showMap: boolean, onToggleMap: () => void, onPublish: () => void }) {
  const [publishing, setPublishing] = useState(false);
  
  const groupedEvents = useMemo(() => {
    const groups: Record<string, TravelEvent[]> = {};
    const sortedEvents = [...trip.events].sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.time.localeCompare(b.time);
    });
    sortedEvents.forEach(event => {
      if (!groups[event.date]) groups[event.date] = [];
      groups[event.date].push(event);
    });
    return Object.entries(groups).sort(([dateA], [dateB]) => dateA.localeCompare(dateB));
  }, [trip.events]);

  const handlePublish = async () => { 
    setPublishing(true); 
    await new Promise(r => setTimeout(r, 1500)); 
    setPublishing(false); 
    onPublish(); 
  };
  
  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-[#050505] w-full relative overflow-hidden">
      <header className="h-16 bg-white dark:bg-[#111111] border-b border-slate-200 dark:border-[#1f1f1f] px-6 flex items-center justify-between sticky top-0 z-50 shadow-xl">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-[#050505] hover:bg-slate-100 dark:hover:bg-[#1a1a1a] text-slate-900 dark:text-white border border-slate-200 dark:border-[#1f1f1f] transition-colors shadow-sm"><ChevronLeft className="h-5 w-5" /></Button>
          <div className="h-6 w-px bg-slate-200 dark:bg-[#1f1f1f]" />
          <div className="flex flex-col">
            <h2 className="text-lg font-black italic uppercase tracking-tighter text-slate-900 dark:text-white leading-none">{trip.name}</h2>
            <div className="flex items-center gap-2 mt-1 leading-none">
              <Badge className="bg-[#0bd2b5]/10 text-[#0bd2b5] border border-[#0bd2b5]/20 font-bold px-2 py-0 h-4 rounded-full text-[8px] uppercase tracking-wider">LIVE EDITOR</Badge>
              <span className="text-[9px] font-bold text-slate-500 dark:text-[#888888] uppercase tracking-[0.2em] leading-none">ATTENDEES: {trip.attendees}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={onToggleTheme} className="h-10 w-10 rounded-xl bg-white dark:bg-[#111111] hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-[#0bd2b5] transition-all border border-slate-200 dark:border-[#1f1f1f] flex items-center justify-center cursor-pointer shadow-sm">
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          <Button variant="ghost" onClick={onToggleMap} className={`font-bold text-[10px] uppercase tracking-widest rounded-xl h-10 px-4 gap-2 border transition-all ${showMap ? 'bg-[#0bd2b5] text-slate-900 dark:text-black border-transparent shadow-lg shadow-[#0bd2b5]/20' : 'bg-white dark:bg-[#111111] text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white border-slate-200 dark:border-[#1f1f1f] shadow-sm'}`}>
            <MapIcon className="h-4 w-4" /> {showMap ? 'HIDE MAP' : 'SHOW MAP'}
          </Button>
          <Button onClick={handlePublish} disabled={publishing} className="bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black font-bold h-10 px-6 rounded-xl shadow-lg shadow-[#0bd2b5]/20 transition-all text-[10px] uppercase tracking-widest min-w-[140px]">
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : "PUBLISH TRIP"}
          </Button>
        </div>
      </header>
      <div className="flex-1 flex overflow-hidden">
        <aside className="w-64 border-r border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] flex flex-col hidden lg:flex shadow-sm relative z-30">
          <div className="p-5 border-b border-slate-200 dark:border-[#1f1f1f] flex items-center justify-between bg-slate-50/30 dark:bg-[#050505]/30">
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#0bd2b5]">ITINERARY</span>
            <Button variant="outline" size="icon" className="h-6 w-6 rounded-md bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] hover:bg-[#0bd2b5] hover:text-slate-900 dark:hover:text-black text-[#0bd2b5] transition-colors shadow-sm"><Plus className="h-3 w-3" /></Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-2">
              {groupedEvents.map(([date, _], i) => (
                <button key={date} className={`w-full text-left p-3 rounded-xl group relative transition-all duration-300 ${i === 0 ? 'bg-[#0bd2b5]/10 text-[#0bd2b5]' : 'hover:bg-slate-50 dark:hover:bg-[#050505] text-slate-500 dark:text-[#888888] hover:text-slate-900 dark:hover:text-white'}`}>
                  <div className="flex items-center gap-3 relative z-10 leading-none">
                    <div className={`h-10 w-10 rounded-lg flex flex-col items-center justify-center font-black italic text-[9px] uppercase tracking-tighter ${i === 0 ? 'bg-[#0bd2b5] text-slate-900 dark:text-black shadow-lg shadow-[#0bd2b5]/20' : 'bg-slate-50 dark:bg-[#050505] border border-slate-200 dark:border-[#1f1f1f] shadow-sm'}`}>
                      <span className="opacity-70">{new Date(date).toLocaleDateString('en-US', { month: 'short' })}</span>
                      <span className="text-xs mt-0.5">{new Date(date).getDate()}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold opacity-60 uppercase tracking-wider">DAY {i + 1}</span>
                      <span className="text-xs font-bold truncate leading-none mt-1 uppercase tracking-tighter italic">Scheduled</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </aside>
        <div className="flex-1 flex flex-row overflow-hidden relative">
          <main className={`flex-1 flex flex-col relative bg-slate-50 dark:bg-[#050505] overflow-y-auto transition-all duration-500 ${showMap ? 'lg:w-[60%]' : 'w-full'}`}>
            <section className="relative h-[250px] w-full group overflow-hidden border-b border-slate-200 dark:border-[#1f1f1f]">
              <img src={trip.image} className="h-full w-full object-cover brightness-[0.6] dark:brightness-[0.4]" alt="Hero" />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-50 dark:to-[#050505]" />
              <div className="absolute top-6 left-8 right-8 flex justify-between items-start z-20">
                <div className="flex items-center gap-3 bg-black/40 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl text-white shadow-xl">
                  <span className="text-[9px] font-black italic uppercase tracking-widest text-[#0bd2b5]">TRIP CONFIRMED</span>
                </div>
                <div className="bg-black/40 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-xl flex flex-col items-end text-white shadow-xl">
                  <span className="text-[9px] font-bold uppercase tracking-widest opacity-60 leading-none">LOCAL TIME</span>
                  <span className="text-xl font-black italic tracking-tighter leading-none mt-1 uppercase">10:35 <span className="text-[10px] font-bold text-[#0bd2b5] ml-1">GMT+3</span></span>
                </div>
              </div>
              <div className="absolute left-8 bottom-8 flex items-center gap-6 z-30">
                <div className="h-16 w-16 rounded-2xl bg-[#0bd2b5] text-black flex items-center justify-center font-black italic text-2xl shadow-[0_0_30px_rgba(11,210,181,0.3)]">AM</div>
                <div className="text-white">
                  <h3 className="text-2xl font-black italic uppercase tracking-tighter leading-none">ASH MURRAY</h3>
                  <p className="text-[9px] font-bold text-[#0bd2b5] uppercase tracking-[0.3em] mt-2">LEAD DESIGNER</p>
                </div>
              </div>
            </section>
            <div className="px-10 pt-10 pb-32 max-w-5xl w-full mx-auto relative">
              <div className="space-y-16">
                {groupedEvents.length > 0 ? groupedEvents.map(([date, events]) => (
                  <DaySection key={date} date={new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase()} onAddEvent={() => onAddEvent()}>
                    <div className="grid grid-cols-1 gap-6">
                      {events.map((event) => (
                        <EventCard key={event.id} event={event} onClick={() => onEditEvent(event)} onDelete={() => onDeleteEvent(event.id)} />
                      ))}
                    </div>
                  </DaySection>
                )) : (
                  <div className="flex flex-col items-center justify-center py-32 bg-white dark:bg-[#111111] border-2 border-dashed border-slate-200 dark:border-[#1f1f1f] rounded-[2rem] text-slate-500 dark:text-[#888888] hover:border-[#0bd2b5] transition-colors cursor-pointer group" onClick={() => onAddEvent()}>
                    <Plus className="h-12 w-12 mb-4 opacity-20 group-hover:scale-110 group-hover:text-[#0bd2b5] transition-all" />
                    <p className="font-bold text-[10px] uppercase tracking-[0.3em]">ADD YOUR FIRST EVENT</p>
                  </div>
                )}
              </div>
            </div>
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-10 duration-500">
              <div className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] p-2 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.15)] flex items-center gap-1 ring-1 ring-slate-900/5 dark:ring-white/5 shadow-xl">
                <DockButton icon={<Plane className="h-4 w-4" />} label="Flight" onClick={() => onAddEvent("flight")} />
                <DockButton icon={<Hotel className="h-4 w-4" />} label="Hotel" onClick={() => onAddEvent("hotel")} />
                <DockButton icon={<Compass className="h-4 w-4" />} label="Activity" onClick={() => onAddEvent("activity")} />
                <DockButton icon={<Utensils className="h-4 w-4" />} label="Dining" onClick={() => onAddEvent("dining")} />
                <div className="h-8 w-px bg-slate-200 dark:bg-[#1f1f1f] mx-2" />
                <Button className="h-10 w-10 rounded-xl bg-[#0bd2b5] hover:opacity-90 text-slate-900 dark:text-black shadow-xl shadow-[#0bd2b5]/20 p-0">
                  <Zap className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </main>
          {showMap && (
            <aside className="w-[40%] h-full border-l border-slate-200 dark:border-[#1f1f1f] bg-white dark:bg-[#111111] hidden lg:block animate-in slide-in-from-right duration-500 relative z-40 overflow-hidden shadow-2xl">
              <TripMap theme={theme} />
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function DockButton({ icon, label, onClick }: { icon: any, label: string, onClick: () => void }) {
  return (
    <button onClick={onClick} className="group flex flex-col items-center justify-center h-10 px-4 rounded-xl hover:bg-[#0bd2b5]/10 transition-colors duration-200 relative">
      <div className="text-slate-400 dark:text-[#666] group-hover:text-[#0bd2b5] transition-transform group-hover:scale-110">{icon}</div>
      <span className="absolute -top-10 bg-white dark:bg-[#111111] text-[#0bd2b5] border border-slate-200 dark:border-[#1f1f1f] text-[9px] font-bold uppercase tracking-widest px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-all transform translate-y-2 group-hover:translate-y-0 whitespace-nowrap shadow-2xl">ADD {label}</span>
    </button>
  );
}

const ROUTE_COORDS: [number, number][] = [
  [53.3537, -2.275],   // Manchester (MAN)
  [25.2731, 51.6080],  // Doha (DOH)
  [-1.3192, 36.9278],  // Nairobi (NBO)
];

const ROUTE_LABELS = ["MAN", "DOH", "NBO"];

const ROUTE_CITIES = ["Manchester", "Doha", "Nairobi"];

function createPinIcon(label: string, index: number, active: boolean) {
  const city = ROUTE_CITIES[index] || label;
  const accent = "#0bd2b5";
  return L.divIcon({
    className: "",
    iconSize: [0, 0],
    iconAnchor: [20, 68],
    html: `<div style="display:flex;flex-direction:column;align-items:center;width:40px;">
      ${active ? `<div style="position:absolute;top:4px;left:4px;width:32px;height:32px;border-radius:50%;background:${accent};opacity:0.25;animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;"></div>` : ''}
      <div style="position:relative;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${active ? accent : '#111'};border:3px solid ${active ? '#fff' : '#333'};box-shadow:0 4px 12px rgba(0,0,0,0.4)${active ? `,0 0 20px rgba(11,210,181,0.4)` : ''};z-index:2;">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${active ? '#000' : '#888'}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div style="width:2px;height:10px;background:${active ? accent : '#333'};z-index:1;"></div>
      <div style="width:6px;height:6px;border-radius:50%;background:${active ? accent : '#555'};box-shadow:0 2px 4px rgba(0,0,0,0.3);"></div>
      <div style="margin-top:6px;background:${active ? accent : '#111'};border:1px solid ${active ? 'rgba(11,210,181,0.3)' : '#333'};border-radius:8px;padding:3px 8px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
        <div style="font-size:10px;font-weight:900;font-style:italic;color:${active ? '#000' : '#fff'};letter-spacing:0.05em;text-align:center;line-height:1;">${label}</div>
        <div style="font-size:7px;font-weight:700;color:${active ? 'rgba(0,0,0,0.5)' : '#888'};letter-spacing:0.1em;text-align:center;margin-top:2px;text-transform:uppercase;">${city}</div>
      </div>
    </div>`,
  });
}

function FitBounds() {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(ROUTE_COORDS.map(c => [c[0], c[1]] as [number, number]), { padding: [50, 50] });
  }, [map]);
  return null;
}

function TripMap({ theme }: { theme: Theme }) {
  const tileUrl = theme === "dark"
    ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
    : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";

  return (
    <div className="h-full w-full relative">
      <MapContainer
        center={[30, 25]}
        zoom={3}
        className="h-full w-full"
        zoomControl={false}
        attributionControl={false}
        style={{ background: theme === "dark" ? "#050505" : "#f8fafc" }}
      >
        <TileLayer url={tileUrl} />
        <FitBounds />
        <Polyline
          positions={ROUTE_COORDS}
          pathOptions={{ color: "#0bd2b5", weight: 2.5, dashArray: "8 6", opacity: 0.7 }}
        />
        {ROUTE_COORDS.map((pos, i) => (
          <Marker key={i} position={pos} icon={createPinIcon(ROUTE_LABELS[i], i, i === 0)}>
            <Popup className="leaflet-popup-custom">
              <span style={{ fontWeight: 900, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {ROUTE_LABELS[i]}
              </span>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {/* Route summary overlay */}
      <div className="absolute bottom-6 left-6 right-6 bg-white/90 dark:bg-[#111111]/90 backdrop-blur-xl border border-slate-200 dark:border-[#1f1f1f] rounded-2xl p-5 shadow-xl z-[1000]">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-[#0bd2b5]">ROUTE SUMMARY</span>
          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 dark:text-[#888888]">2 LEGS</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">MAN</span>
          <div className="flex-1 flex items-center gap-1">
            <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
            <Plane className="h-3.5 w-3.5 text-[#0bd2b5] -rotate-12" />
            <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
          </div>
          <span className="text-sm font-black italic uppercase tracking-tighter text-slate-500 dark:text-[#888888]">DOH</span>
          <div className="flex-1 flex items-center gap-1">
            <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
            <Plane className="h-3.5 w-3.5 text-[#0bd2b5] -rotate-12" />
            <div className="h-px flex-1 bg-slate-200 dark:bg-[#1f1f1f]" />
          </div>
          <span className="text-sm font-black italic uppercase tracking-tighter text-slate-900 dark:text-white">NBO</span>
        </div>
      </div>
    </div>
  );
}

function DaySection({ date, children, onAddEvent }: { date: string, children: React.ReactNode, onAddEvent: () => void }) { 
  return ( 
    <div className="space-y-8">
      <div className="flex items-center justify-between sticky top-16 z-10 bg-slate-50/80 dark:bg-[#050505]/80 backdrop-blur-md py-6 border-b border-slate-200 dark:border-[#1f1f1f] group/header">
        <h3 className="text-xs font-black italic uppercase tracking-tighter text-slate-900 dark:text-white flex items-center gap-4 transition-transform group-hover/header:translate-x-1">
          <div className="h-2 w-2 bg-[#0bd2b5] rounded-full shadow-[0_0_10px_rgba(11,210,181,0.5)]" />
          {date}
        </h3>
        <Button variant="ghost" className="rounded-xl h-9 font-bold text-[#0bd2b5] text-[9px] hover:bg-[#0bd2b5] hover:text-slate-900 dark:hover:text-black bg-[#0bd2b5]/5 px-5 transition-all border border-[#0bd2b5]/10 uppercase tracking-widest" onClick={onAddEvent}>
          <Plus className="h-3.5 w-3.5 mr-2" /> QUICK ADD
        </Button>
      </div>
      <div className="space-y-6">{children}</div>
    </div> 
  ); 
}

const EVENT_ICON_CONFIG = {
  flight: { icon: Plane },
  hotel: { icon: Hotel },
  activity: { icon: Compass },
  dining: { icon: Utensils },
};

function EventCard({ event, onClick, onDelete }: { event: TravelEvent, onClick: () => void, onDelete: () => void }) {
  const isFlight = event.type === 'flight';
  const config = EVENT_ICON_CONFIG[event.type];
  const Icon = config.icon;
  return (
    <div onClick={onClick} className="group relative bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] rounded-2xl overflow-hidden hover:border-[#0bd2b5]/40 transition-all hover:shadow-2xl cursor-pointer">
      <div className="flex p-6 gap-6">
        <div className="flex flex-col items-center shrink-0 w-16">
          <div className="h-10 w-10 rounded-xl bg-[#0bd2b5]/10 text-[#0bd2b5] border border-[#0bd2b5]/20 flex items-center justify-center mb-2">
            <Icon className="h-4.5 w-4.5" />
          </div>
          <span className="text-sm font-black italic tracking-tighter text-slate-900 dark:text-white leading-none">{event.time.split(' ')[0]}</span>
          <span className="text-[8px] font-bold text-slate-400 dark:text-[#555] uppercase tracking-wider mt-1 leading-none">{event.time.split(' ')[1]}</span>
        </div>
        <div className="flex-1 flex gap-5 min-w-0">
          {event.image && (
            <div className="w-20 h-20 rounded-xl border border-slate-200 dark:border-[#1f1f1f] shrink-0 overflow-hidden">
              <img src={event.image} alt={event.title} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-2">
              <h4 className="text-base font-black italic uppercase tracking-tighter text-slate-900 dark:text-white leading-tight truncate group-hover:text-[#0bd2b5] transition-colors">{event.title}</h4>
              {event.status && (
                <Badge variant="secondary" className={`font-bold text-[8px] px-2 py-0.5 border-none rounded-full uppercase tracking-wider shrink-0 ${event.status === 'On Time' || event.status === 'Confirmed' ? 'bg-emerald-500/10 text-emerald-400' : event.status === 'Proposed' ? 'bg-amber-500/10 text-amber-500' : 'bg-[#0bd2b5]/10 text-[#0bd2b5]'}`}>{event.status}</Badge>
              )}
            </div>
            <p className="text-[10px] font-bold text-slate-400 dark:text-[#666] flex items-center gap-2 leading-none uppercase tracking-widest">
              <MapPin className="h-3 w-3 text-[#0bd2b5]" /> {event.location}
            </p>
            <div className="flex items-center gap-6 mt-4 text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 dark:text-[#555]">
              {isFlight && (
                <>
                  {event.airline && <span className="flex items-center gap-1.5"><Plane className="h-3 w-3 text-[#0bd2b5]" /> {event.airline} {event.flightNum}</span>}
                  {event.terminal && <span>T{event.terminal.replace('T','')}</span>}
                  {event.duration && <span className="flex items-center gap-1.5 ml-auto"><Clock className="h-3 w-3 text-[#0bd2b5]" /> {event.duration}</span>}
                </>
              )}
              {event.type === 'hotel' && (
                <>
                  {event.roomType && <span className="flex items-center gap-1.5"><Hotel className="h-3 w-3 text-[#0bd2b5]" /> {event.roomType}</span>}
                  {event.checkin && <span className="ml-auto">IN: {event.checkin}</span>}
                </>
              )}
              {event.type === 'dining' && event.notes && (
                <span className="text-slate-400 dark:text-[#555] truncate">{event.notes}</span>
              )}
              {event.type === 'activity' && event.notes && (
                <span className="text-slate-400 dark:text-[#555] truncate">{event.notes}</span>
              )}
            </div>
          </div>
        </div>
        <div className="shrink-0 flex items-start" onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-9 w-9 rounded-lg bg-slate-50 dark:bg-[#050505] text-slate-400 dark:text-[#555] flex items-center justify-center border border-transparent hover:border-slate-200 dark:hover:border-[#1f1f1f] hover:text-slate-600 dark:hover:text-[#888] transition-all"><MoreVertical className="h-4 w-4" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-white dark:bg-[#111111] border border-slate-200 dark:border-[#1f1f1f] text-slate-900 dark:text-white rounded-xl shadow-2xl p-1 min-w-[160px]">
              <DropdownMenuItem onClick={onClick} className="gap-2 p-2 rounded-lg font-bold text-[9px] uppercase tracking-wider text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-[#050505]"><Settings className="h-3.5 w-3.5 text-[#0bd2b5]" /> EDIT EVENT</DropdownMenuItem>
              <Separator className="my-1 bg-slate-200 dark:bg-[#1f1f1f]" />
              <DropdownMenuItem onClick={onDelete} className="gap-2 p-2 rounded-lg font-bold text-[9px] uppercase tracking-wider text-destructive hover:bg-destructive/10"><Trash2 className="h-3.5 w-3.5" /> DELETE</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

function ModulePlaceholder({ tabName }: { tabName: string }) {
  return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-50 dark:bg-[#050505] p-12 relative overflow-hidden">
      <Badge className="mb-10 bg-[#0bd2b5]/10 text-[#0bd2b5] border border-[#0bd2b5]/20 font-black italic px-6 py-1.5 rounded-full text-[10px] tracking-[0.2em] uppercase">COMING SOON</Badge>
      <div className="bg-white dark:bg-[#111111] h-40 w-40 rounded-full flex items-center justify-center mb-10 border border-slate-200 dark:border-[#1f1f1f] shadow-2xl relative group">
        <div className="absolute inset-0 rounded-full bg-[#0bd2b5]/5 animate-ping opacity-20" />
        <Activity className="h-16 w-12 text-[#0bd2b5] animate-pulse" />
      </div>
      <h2 className="text-5xl font-black italic uppercase tracking-tighter text-slate-900 dark:text-white mb-4 leading-none">{tabName} Database</h2>
      <p className="text-slate-500 dark:text-[#888888] font-bold text-[10px] uppercase tracking-[0.3em] text-center max-w-sm leading-relaxed">This section is currently under development.</p>
    </div>
  );
}
