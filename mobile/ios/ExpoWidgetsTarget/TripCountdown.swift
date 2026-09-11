import WidgetKit
import SwiftUI
import ActivityKit
internal import ExpoWidgets

// MARK: - Data

private struct TD {
  let state: String
  let tripName: String
  let destination: String
  let tripImage: String
  let daysLeft: Int
  let totalCountdownDays: Int
  let startDate: String
  let currentDay: Int
  let totalDays: Int
  let accent: Color
  let event1: String
  let event2: String
  let event3: String
  let eventTime: String
  let eventTitle: String
  let eventLocation: String
  let eventLabel: String
  let url: String

  init(props: [String: Any]?) {
    state       = (props?["state"] as? String) ?? "empty"
    tripName    = (props?["tripName"] as? String) ?? ""
    destination = (props?["destination"] as? String) ?? ""
    tripImage   = (props?["tripImage"] as? String) ?? ""
    daysLeft    = (props?["daysLeft"] as? Int) ?? 0
    totalCountdownDays = (props?["totalCountdownDays"] as? Int) ?? 30
    startDate   = (props?["startDate"] as? String) ?? ""
    currentDay  = (props?["currentDay"] as? Int) ?? 0
    totalDays   = (props?["totalDays"] as? Int) ?? 0
    event1      = (props?["event1"] as? String) ?? ""
    event2      = (props?["event2"] as? String) ?? ""
    event3      = (props?["event3"] as? String) ?? ""
    eventTime = props?["eventTime"] as? String ?? ""
    eventTitle = props?["eventTitle"] as? String ?? ""
    eventLocation = props?["eventLocation"] as? String ?? ""
    eventLabel = props?["eventLabel"] as? String ?? "Next up"
    url = props?["url"] as? String ?? "/(tabs)"
    let hex = (props?["accentColor"] as? String) ?? "#0bd2b5"
    accent = Color(hex: hex)
  }

  var name: String { destination.isEmpty ? tripName : destination }
  var progress: Double {
    guard totalDays > 0 else { return 0 }
    return Double(currentDay) / Double(totalDays)
  }
  var countdownProgress: Double {
    let scale = Double(max(totalCountdownDays, 10))
    return max(0, min(1, 1.0 - Double(daysLeft) / scale))
  }
}

private extension Color {
  init(hex: String) {
    let h = hex.trimmingCharacters(in: .init(charactersIn: "#"))
    let scanner = Scanner(string: h)
    var rgb: UInt64 = 0
    scanner.scanHexInt64(&rgb)
    self.init(
      red: Double((rgb >> 16) & 0xFF) / 255,
      green: Double((rgb >> 8) & 0xFF) / 255,
      blue: Double(rgb & 0xFF) / 255
    )
  }
}

// MARK: - Components

private struct ProgressRing: View {
  let value: Double
  let color: Color
  let width: CGFloat
  let size: CGFloat

  var body: some View {
    ZStack {
      Circle()
        .stroke(color.opacity(0.2), lineWidth: width)
      Circle()
        .trim(from: 0, to: min(value, 1))
        .stroke(color, style: StrokeStyle(lineWidth: width, lineCap: .round))
        .rotationEffect(.degrees(-90))
    }
    .frame(width: size, height: size)
  }
}

private func loadCachedImage(_ urlString: String) -> UIImage? {
  if urlString.hasPrefix("file://") || urlString.hasPrefix("/") {
    let path = urlString.hasPrefix("file://") ? String(urlString.dropFirst(7)) : urlString
    return UIImage(contentsOfFile: path)
  }
  return nil
}

private struct TripBackground: View {
  let urlString: String
  let dark: Bool

  var body: some View {
    if let img = loadCachedImage(urlString) {
      ZStack {
        Image(uiImage: img)
          .resizable()
          .aspectRatio(contentMode: .fill)
        LinearGradient(
          colors: [
            Color.black.opacity(0.3),
            Color.black.opacity(0.55),
            Color.black.opacity(0.8),
            Color.black.opacity(0.92)
          ],
          startPoint: .top,
          endPoint: .bottom
        )
      }
    } else {
      Color(hex: "#050505")
    }
  }
}

// MARK: - Widget

struct TripCountdown: Widget {
  let name: String = "TripCountdown"
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      Router(entry: entry)
    }
    .contentMarginsDisabled()
    .configurationDisplayName("Your trip")
    .description("Your next adventure, then your next stop.")
    .supportedFamilies([
      .systemSmall, .systemMedium, .systemLarge,
      .accessoryCircular, .accessoryRectangular, .accessoryInline,
    ])
  }
}

private struct Router: View {
  let entry: WidgetsTimelineProvider.Entry
  @Environment(\.widgetFamily) var fam
  @Environment(\.colorScheme) var cs

  var body: some View {
    let d = TD(props: entry.props)
    let hasImage = d.state == "upcoming" && !d.tripImage.isEmpty
    let dark = hasImage ? true : cs == .dark
    Group {
      switch fam {
      case .systemSmall:  TripBriefing(d: d, dark: dark, family: .systemSmall)
      case .systemMedium: TripBriefing(d: d, dark: dark, family: .systemMedium)
      case .systemLarge:  TripBriefing(d: d, dark: dark, family: .systemLarge)
      case .accessoryCircular:    LockCircle(d: d)
      case .accessoryRectangular: LockRect(d: d)
      case .accessoryInline:      LockInline(d: d)
      default: TripBriefing(d: d, dark: dark, family: .systemMedium)
      }
    }
    .bg(dark: dark, fam: fam, imageUrl: hasImage ? d.tripImage : "")
    .widgetURL(URL(string: d.url))
  }
}

private extension View {
  @ViewBuilder func bg(dark: Bool, fam: WidgetFamily, imageUrl: String = "") -> some View {
    if fam == .accessoryCircular || fam == .accessoryRectangular || fam == .accessoryInline {
      self
    } else if #available(iOS 17.0, *) {
      self.containerBackground(for: .widget) {
        if !imageUrl.isEmpty {
          TripBackground(urlString: imageUrl, dark: dark)
        } else {
          dark ? Color(hex: "#050505") : Color.white
        }
      }
    } else {
      ZStack {
        if !imageUrl.isEmpty {
          TripBackground(urlString: imageUrl, dark: dark)
        } else {
          (dark ? Color(hex: "#050505") : Color.white)
        }
        self
      }
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SMALL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// One travel briefing, with more itinerary detail as space grows.
private struct TripBriefing: View {
  let d: TD
  let dark: Bool
  let family: WidgetFamily
  private var small: Bool { family == .systemSmall }
  private var large: Bool { family == .systemLarge }
  private var ink: Color { dark ? .white : Color(hex: "#151719") }
  private var secondary: Color { dark ? .white.opacity(0.78) : Color(hex: "#565E64") }
  private var accent: Color { dark ? d.accent : Color(hex: "#007B6D") }

  var body: some View {
    VStack(alignment: .leading, spacing: small ? 7 : 10) {
      if d.state == "upcoming" {
        HStack(spacing: 5) {
          Image(systemName: "airplane.departure")
          Text("Your next trip")
        }
        .font(.system(size: 12, weight: .medium)).foregroundStyle(secondary)
        Spacer(minLength: 8)
        Text(d.name)
          .font(.system(size: small ? 23 : 30, weight: .semibold))
          .lineLimit(2).minimumScaleFactor(0.85)
        HStack(alignment: .firstTextBaseline, spacing: 5) {
          Text("\(d.daysLeft)").font(.system(size: small ? 27 : 32, weight: .semibold)).monospacedDigit()
          Text(d.daysLeft == 1 ? "day to go" : "days to go")
            .font(.system(size: 13, weight: .medium))
        }
        Text("Departing \(d.startDate)")
          .font(.system(size: 12, weight: .medium)).foregroundStyle(secondary)
        if large {
          Text(d.tripName).font(.system(size: 15)).foregroundStyle(secondary).lineLimit(2).padding(.top, 8)
        }
      } else if d.state == "active" {
        HStack(alignment: .firstTextBaseline) {
          Text("Today · Day \(d.currentDay)")
            .font(.system(size: 12, weight: .medium)).foregroundStyle(secondary)
          if !small {
            Spacer(minLength: 12)
            Text(d.name).font(.system(size: 12, weight: .medium)).foregroundStyle(secondary).lineLimit(1)
          }
        }
        if !d.eventTitle.isEmpty {
          Spacer(minLength: 0)
          HStack(alignment: .firstTextBaseline, spacing: 7) {
            Text(d.eventTime.isEmpty ? "Time TBC" : d.eventTime)
              .font(.system(size: small ? 23 : 28, weight: .semibold)).monospacedDigit()
            if !small {
              Text(d.eventLabel).font(.system(size: 12, weight: .medium))
            }
          }.foregroundStyle(accent)
          Text(d.eventTitle).font(.system(size: small ? 16 : 21, weight: .semibold)).lineLimit(small ? 2 : 2)
          if !d.eventLocation.isEmpty && !small {
            Label(d.eventLocation, systemImage: "mappin")
              .font(.system(size: 13)).foregroundStyle(secondary).lineLimit(1)
          }
          if large {
            Spacer(minLength: 10)
            if !d.event2.isEmpty || !d.event3.isEmpty {
              Rectangle().fill(secondary.opacity(0.2)).frame(height: 1)
              Text("Later today").font(.system(size: 12, weight: .medium)).foregroundStyle(secondary)
              if !d.event2.isEmpty { itineraryLine(d.event2) }
              if !d.event3.isEmpty { itineraryLine(d.event3) }
            }
          }
        } else {
          Spacer(minLength: 4)
          Text("Time to explore")
            .font(.system(size: small ? 22 : 27, weight: .semibold)).lineLimit(2)
          Text("No more plans today")
            .font(.system(size: 13)).foregroundStyle(secondary)
          if !small { Text(d.name).font(.system(size: 16, weight: .medium)).lineLimit(1) }
          Spacer(minLength: 0)
        }
      } else {
        Label("Dalefy", systemImage: "airplane")
          .font(.system(size: 12, weight: .medium)).foregroundStyle(secondary)
        Spacer(minLength: 8)
        Text("Your next\nadventure")
          .font(.system(size: small ? 24 : 30, weight: .semibold)).lineLimit(2)
        Text("Join a trip to get started")
          .font(.system(size: 13)).foregroundStyle(secondary).lineLimit(2)
      }
    }
    .foregroundStyle(ink)
    .padding(small ? 16 : 20)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private func itineraryLine(_ line: String) -> some View {
    let parts = line.components(separatedBy: "  ")
    return HStack(alignment: .firstTextBaseline, spacing: 12) {
      Text(parts.first ?? "").font(.system(size: 13, weight: .medium)).foregroundStyle(secondary)
        .frame(width: 70, alignment: .leading)
      Text(parts.dropFirst().joined(separator: "  "))
        .font(.system(size: 15, weight: .medium)).lineLimit(2)
    }
  }
}

private struct LockCircle: View {
  let d: TD
  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      VStack(spacing: 0) {
        if d.state == "upcoming" {
          Text("\(d.daysLeft)").font(.system(size: 20, weight: .semibold))
          Text(d.daysLeft == 1 ? "day" : "days").font(.system(size: 11))
        } else if d.state == "active" {
          Text("Day").font(.system(size: 11))
          Text("\(d.currentDay)").font(.system(size: 20, weight: .semibold))
        } else { Image(systemName: "airplane").font(.system(size: 20)) }
      }
    }
  }
}

private struct LockRect: View {
  let d: TD
  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      if d.state == "upcoming" {
        Text("\(d.daysLeft) \(d.daysLeft == 1 ? "day" : "days") to go").font(.system(size: 12, weight: .medium))
        Text(d.name).font(.system(size: 15, weight: .semibold)).lineLimit(1)
        Text("Departing \(d.startDate)").font(.system(size: 12)).foregroundStyle(.secondary)
      } else if d.state == "active" {
        Text("Today · Day \(d.currentDay)").font(.system(size: 12, weight: .medium))
        Text(d.eventTitle.isEmpty ? "Time to explore" : d.eventTitle).font(.system(size: 15, weight: .semibold)).lineLimit(1)
        Text(d.eventTime.isEmpty ? d.name : d.eventTime).font(.system(size: 12)).foregroundStyle(.secondary).lineLimit(1)
      } else {
        Text("Dalefy").font(.system(size: 12, weight: .medium))
        Text("Your next adventure").font(.system(size: 15, weight: .semibold))
        Text("Join a trip to get started").font(.system(size: 12)).foregroundStyle(.secondary)
      }
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}

private struct LockInline: View {
  let d: TD
  var body: some View {
    switch d.state {
    case "upcoming":
      HStack(spacing: 4) {
        Image(systemName: "airplane.departure")
        Text("\(d.name) in \(d.daysLeft) \(d.daysLeft == 1 ? "day" : "days")")
      }
    case "active":
      HStack(spacing: 4) {
        Image(systemName: "airplane")
        Text("\(d.destination) - Day \(d.currentDay)/\(d.totalDays)")
      }
    default:
      HStack(spacing: 4) {
        Image(systemName: "airplane")
        Text("No upcoming trips")
      }
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LIVE ACTIVITY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// MARK: - Props

private struct FlightProps {
  let flightNum: String
  let airline: String
  let from: String
  let to: String
  let departTime: String
  let arriveTime: String
  let status: String
  let gate: String
  let duration: String
  let progress: Double

  var statusLabel: String {
    let s = status.lowercased()
    if s.contains("cancel") { return "CANCELLED" }
    if s.contains("delay") { return "DELAYED" }
    if s.contains("landed") || s.contains("arrived") { return "LANDED" }
    if s.contains("boarding") { return "BOARDING" }
    if s.contains("in flight") || s.contains("airborne") { return "IN FLIGHT" }
    if s.contains("on time") { return "ON TIME" }
    return "Scheduled"
  }

  var statusColor: Color {
    let s = status.lowercased()
    if s.contains("cancel") { return Color(hex: "#ef4444") }
    if s.contains("delay") { return Color(hex: "#f59e0b") }
    if s.contains("landed") || s.contains("arrived") { return Color(hex: "#22c55e") }
    if s.contains("boarding") { return teal }
    if s.contains("in flight") || s.contains("airborne") { return Color(hex: "#3b82f6") }
    return .white.opacity(0.75)
  }

  var airlineCode: String {
    let letters = flightNum.prefix(while: { $0.isLetter })
    return letters.isEmpty ? String(flightNum.prefix(2)).uppercased() : String(letters).uppercased()
  }

  init(_ d: [String: Any]) {
    flightNum  = d["flightNum"] as? String ?? ""
    airline    = d["airline"] as? String ?? ""
    from       = d["from"] as? String ?? "---"
    to         = d["to"] as? String ?? "---"
    departTime = d["departTime"] as? String ?? ""
    arriveTime = d["arriveTime"] as? String ?? "--:--"
    status     = d["status"] as? String ?? "Scheduled"
    gate       = d["gate"] as? String ?? ""
    duration   = d["duration"] as? String ?? ""
    progress   = d["progress"] as? Double ?? 0
  }
}

private struct EventProps {
  let title: String
  let shortTitle: String
  let type: String
  let time: String
  let location: String
  let icon: String
  let startTimestamp: Double
  let endTimestamp: Double

  var typeLabel: String { type.uppercased() }
  var displayTitle: String { shortTitle.isEmpty ? title : shortTitle }

  init(_ d: [String: Any]) {
    title      = d["title"] as? String ?? ""
    shortTitle = d["shortTitle"] as? String ?? ""
    type       = d["type"] as? String ?? "activity"
    time       = d["time"] as? String ?? ""
    location   = d["location"] as? String ?? ""
    icon       = d["icon"] as? String ?? "calendar"
    startTimestamp = d["startTimestamp"] as? Double ?? 0
    endTimestamp = d["endTimestamp"] as? Double ?? 0
  }
}

private let teal = Color(hex: "#0bd2b5")


private func parse(_ json: String) -> [String: Any] {
  guard let data = json.data(using: .utf8),
        let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  else { return [:] }
  return dict
}

// MARK: - Widget

struct NativeLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveActivityAttributes.self) { ctx in
      let n = ctx.state.name
      let p = parse(ctx.state.props)
      VStack(alignment: .leading, spacing: 8) {
        BannerView(name: n, props: p)
        if ctx.isStale { Text("Open Dalefy for your latest itinerary").font(.system(size: 12)).foregroundStyle(.white.opacity(0.7)) }
      }
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .activityBackgroundTint(Color(hex: "#101214"))
        .widgetURL(ctx.attributes.url.flatMap(URL.init(string:)))
    } dynamicIsland: { ctx in
      let n = ctx.state.name
      let p = parse(ctx.state.props)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) { ExLeading(name: n, props: p) }
        DynamicIslandExpandedRegion(.trailing) { ExTrailing(name: n, props: p) }
        DynamicIslandExpandedRegion(.center) { ExCenter(name: n, props: p) }
        DynamicIslandExpandedRegion(.bottom) { ExBottom(name: n, props: p) }
      } compactLeading: {
        CmpLeading(name: n, props: p)
      } compactTrailing: {
        CmpTrailing(name: n, props: p)
      } minimal: {
        MinView(name: n, props: p)
      }
      .widgetURL(ctx.attributes.url.flatMap(URL.init(string:)))
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  BANNER (Lock Screen)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct BannerView: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      FlightBanner(p: FlightProps(props))
    } else {
      EventBanner(p: EventProps(props))
    }
  }
}

private struct FlightBanner: View {
  let p: FlightProps
  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack {
        Label(p.flightNum, systemImage: "airplane")
          .font(.system(size: 13, weight: .semibold))
        Spacer()
        Text(p.statusLabel).font(.system(size: 12, weight: .medium)).foregroundStyle(p.statusColor)
      }
      HStack {
        airport(p.from, time: p.departTime, alignment: .leading)
        Spacer(minLength: 12)
        Image(systemName: "arrow.right").font(.system(size: 17)).foregroundStyle(.white.opacity(0.45))
        Spacer(minLength: 12)
        airport(p.to, time: p.arriveTime, alignment: .trailing)
      }
      if !p.gate.isEmpty {
        HStack(spacing: 6) {
          Text("Gate").foregroundStyle(.white.opacity(0.7))
          Text(p.gate).fontWeight(.semibold).foregroundStyle(teal)
          Spacer()
          Text("Scheduled times").font(.system(size: 11)).foregroundStyle(.white.opacity(0.6))
        }.font(.system(size: 16))
      }
    }.foregroundStyle(.white)
  }
  private func airport(_ name: String, time: String, alignment: HorizontalAlignment) -> some View {
    VStack(alignment: alignment, spacing: 3) {
      Text(name).font(.system(size: name.count > 4 ? 18 : 28, weight: .semibold)).lineLimit(1)
      Text(time.isEmpty ? "Time TBC" : time).font(.system(size: 17, weight: .medium)).monospacedDigit().foregroundStyle(.white.opacity(0.8))
    }
  }
}

private struct EventBanner: View {
  let p: EventProps
  var body: some View {
    VStack(alignment: .leading, spacing: 9) {
      HStack {
        Label("At \(p.time)", systemImage: p.icon).font(.system(size: 14, weight: .medium)).foregroundStyle(teal)
        Spacer()
        EventTimer(p: p)
      }
      Text(p.title).font(.system(size: 22, weight: .semibold)).foregroundStyle(.white).lineLimit(2)
      if !p.location.isEmpty {
        Label(p.location, systemImage: "mappin").font(.system(size: 14)).foregroundStyle(.white.opacity(0.75)).lineLimit(2)
      }
    }
  }
}

// A system timer continues to advance while JavaScript is suspended.
private struct EventTimer: View {
  let p: EventProps
  var body: some View {
    if p.startTimestamp > Date().timeIntervalSince1970 * 1000 {
      Text(timerInterval: Date()...Date(timeIntervalSince1970: p.startTimestamp / 1000), countsDown: true, showsHours: false)
        .monospacedDigit().font(.system(size: 13, weight: .medium)).foregroundStyle(teal).frame(maxWidth: 64)
    } else {
      Text(p.time).font(.system(size: 13, weight: .medium)).foregroundStyle(teal)
    }
  }
}

private struct CmpLeading: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      Label(p.to.count <= 4 ? p.to : "Flight", systemImage: "airplane")
        .font(.system(size: 13, weight: .semibold)).foregroundStyle(teal).lineLimit(1)
    } else {
      Image(systemName: EventProps(props).icon).font(.system(size: 14, weight: .semibold)).foregroundStyle(teal)
    }
  }
}

private struct CmpTrailing: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      Text(p.gate.isEmpty ? p.departTime : p.gate)
        .font(.system(size: 13, weight: .semibold)).monospacedDigit().lineLimit(1)
    } else { EventTimer(p: EventProps(props)) }
  }
}

private struct MinView: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    Image(systemName: name == "FlightTracker" ? "airplane" : EventProps(props).icon)
      .font(.system(size: 14, weight: .semibold)).foregroundStyle(teal)
  }
}

private struct ExLeading: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      VStack(alignment: .leading, spacing: 3) {
        Text(p.from).font(.system(size: 22, weight: .semibold)).lineLimit(1)
        Text(p.departTime).font(.system(size: 15, weight: .medium)).foregroundStyle(.white.opacity(0.75))
      }.padding(.leading, 8)
    } else {
      let p = EventProps(props)
      Label("At \(p.time)", systemImage: p.icon)
        .font(.system(size: 14, weight: .medium)).foregroundStyle(teal).padding(.leading, 8)
    }
  }
}

private struct ExTrailing: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      VStack(alignment: .trailing, spacing: 3) {
        Text(p.to).font(.system(size: 22, weight: .semibold)).lineLimit(1)
        Text(p.arriveTime).font(.system(size: 15, weight: .medium)).foregroundStyle(.white.opacity(0.75))
      }.padding(.trailing, 8)
    } else { EventTimer(p: EventProps(props)).padding(.trailing, 8) }
  }
}

private struct ExCenter: View {
  let name: String
  let props: [String: Any]
  var body: some View { EmptyView() }
}

private struct ExBottom: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      HStack {
        VStack(alignment: .leading, spacing: 3) {
          Text(p.flightNum).font(.system(size: 13, weight: .semibold))
          Text(p.statusLabel).font(.system(size: 12)).foregroundStyle(p.statusColor)
        }
        Spacer()
        if !p.gate.isEmpty {
          Text("Gate \(p.gate)").font(.system(size: 17, weight: .semibold)).foregroundStyle(teal)
        }
      }.padding(8)
    } else {
      let p = EventProps(props)
      VStack(alignment: .leading, spacing: 6) {
        Text(p.title).font(.system(size: 19, weight: .semibold)).lineLimit(2)
        if !p.location.isEmpty {
          Label(p.location, systemImage: "mappin").font(.system(size: 13)).foregroundStyle(.white.opacity(0.75)).lineLimit(2)
        }
      }.frame(maxWidth: .infinity, alignment: .leading).padding(8)
    }
  }
}
