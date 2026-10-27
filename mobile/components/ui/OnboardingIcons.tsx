import { useContext } from "react";
import { Platform, type ImageStyle, type StyleProp } from "react-native";
import { Image } from "expo-image";
import {
  IconContext, type Icon, type IconProps,
  ArrowUp as NativeArrowUp,
  Bed as NativeBed,
  Bell as NativeBell,
  CalendarDots as NativeCalendarDots,
  ChatsTeardrop as NativeChatsTeardrop,
  Export as NativeExport,
  FileText as NativeFileText,
  Info as NativeInfo,
  User as NativeUser,
  CaretLeft as NativeCaretLeft,
  Camera as NativeCamera,
  Ticket as NativeTicket,
  Check as NativeCheck,
  X as NativeX,
  ClipboardText as NativeClipboardText,
  Envelope as NativeEnvelope,
  LockKey as NativeLockKey,
  ForkKnife as NativeForkKnife,
  MapPin as NativeMapPin,
  Van as NativeVan,
  Car as NativeCar,
  Train as NativeTrain,
  Bus as NativeBus,
  Boat as NativeBoat,
  Anchor as NativeAnchor,
  Airplane as NativeAirplane,
  House as NativeHouse,
  Clock as NativeClock
} from "phosphor-react-native";
import { androidIconSources } from "./androidIconSources";

const originals = { ArrowUp: NativeArrowUp, Bed: NativeBed, Bell: NativeBell, CalendarDots: NativeCalendarDots, ChatsTeardrop: NativeChatsTeardrop, Export: NativeExport, FileText: NativeFileText, Info: NativeInfo, User: NativeUser, CaretLeft: NativeCaretLeft, Camera: NativeCamera, Ticket: NativeTicket, Check: NativeCheck, X: NativeX, ClipboardText: NativeClipboardText, Envelope: NativeEnvelope, LockKey: NativeLockKey, ForkKnife: NativeForkKnife, MapPin: NativeMapPin, Van: NativeVan, Car: NativeCar, Train: NativeTrain, Bus: NativeBus, Boat: NativeBoat, Anchor: NativeAnchor, Airplane: NativeAirplane, House: NativeHouse, Clock: NativeClock };

type IconName = keyof typeof androidIconSources;

// Android decodes the same bundled artwork as an image, independent of the
// native SVG view hierarchy inside the tour's animated/scaled previews.
function icon(name: IconName): Icon {
  const Original = originals[name];
  function OnboardingIcon(props: IconProps) {
    const context = useContext(IconContext);
    const weight = props.weight ?? context.weight ?? "regular";
    if (Platform.OS !== "android" || !(weight in androidIconSources[name])) {
      return <Original {...props} />;
    }
    const size = props.size ?? context.size ?? 24;
    const pixels = typeof size === "number" ? size : Number(size);
    const source = androidIconSources[name][weight as keyof typeof androidIconSources[IconName]];
    return (
      <Image
        source={source}
        tintColor={props.color ?? context.color ?? "#000"}
        contentFit="contain"
        transition={0}
        accessible={!!props.title}
        accessibilityLabel={props.title}
        testID={props.testID}
        style={[
          { width: pixels, height: pixels, flexShrink: 0 },
          context.style as StyleProp<ImageStyle>,
          props.style as StyleProp<ImageStyle>,
          (props.mirrored ?? context.mirrored) ? { transform: [{ scaleX: -1 }] } : undefined,
        ]}
      />
    );
  }
  OnboardingIcon.displayName = `${name}OnboardingIcon`;
  return OnboardingIcon;
}

export const ArrowUp = icon("ArrowUp");
export const Bed = icon("Bed");
export const Bell = icon("Bell");
export const CalendarDots = icon("CalendarDots");
export const ChatsTeardrop = icon("ChatsTeardrop");
export const Export = icon("Export");
export const FileText = icon("FileText");
export const Info = icon("Info");
export const User = icon("User");
export const CaretLeft = icon("CaretLeft");
export const Camera = icon("Camera");
export const Ticket = icon("Ticket");
export const Check = icon("Check");
export const X = icon("X");
export const ClipboardText = icon("ClipboardText");
export const Envelope = icon("Envelope");
export const LockKey = icon("LockKey");
export const ForkKnife = icon("ForkKnife");
export const MapPin = icon("MapPin");
export const Van = icon("Van");
export const Car = icon("Car");
export const Train = icon("Train");
export const Bus = icon("Bus");
export const Boat = icon("Boat");
export const Anchor = icon("Anchor");
export const Airplane = icon("Airplane");
export const House = icon("House");
export const Clock = icon("Clock");
