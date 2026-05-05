import WidgetKit
import SwiftUI
import ActivityKit
internal import ExpoWidgets

// MARK: - Data

private struct TD {
  let state: String
  let tripName: String
  let destination: String
  let daysLeft: Int
  let startDate: String
  let currentDay: Int
  let totalDays: Int
  let accent: Color
  let event1: String
  let event2: String
  let event3: String

  init(props: [String: Any]?) {
    state       = (props?["state"] as? String) ?? "empty"
    tripName    = (props?["tripName"] as? String) ?? ""
    destination = (props?["destination"] as? String) ?? ""
    daysLeft    = (props?["daysLeft"] as? Int) ?? 0
    startDate   = (props?["startDate"] as? String) ?? ""
    currentDay  = (props?["currentDay"] as? Int) ?? 0
    totalDays   = (props?["totalDays"] as? Int) ?? 0
    event1      = (props?["event1"] as? String) ?? ""
    event2      = (props?["event2"] as? String) ?? ""
    event3      = (props?["event3"] as? String) ?? ""
    let hex = (props?["accentColor"] as? String) ?? "#0bd2b5"
    accent = Color(hex: hex)
  }

  var name: String { destination.isEmpty ? tripName : destination }
  var progress: Double {
    guard totalDays > 0 else { return 0 }
    return Double(currentDay) / Double(totalDays)
  }
  var countdownProgress: Double {
    max(0, min(1, 1.0 - Double(daysLeft) / 30.0))
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

private struct TripTimeline: View {
  let progress: Double
  let startLabel: String
  let endLabel: String
  let color: Color

  var body: some View {
    VStack(spacing: 4) {
      GeometryReader { geo in
        let w = geo.size.width
        let pos = min(max(progress, 0.02), 0.98)
        ZStack(alignment: .leading) {
          Capsule()
            .fill(color.opacity(0.1))
            .frame(height: 4)
          Capsule()
            .fill(color)
            .frame(width: w * pos, height: 4)
          Circle()
            .fill(color)
            .frame(width: 10, height: 10)
            .position(x: w * pos, y: 4)
        }
      }
      .frame(height: 10)

      HStack {
        Text(startLabel)
          .font(.system(size: 9, weight: .semibold, design: .monospaced))
          .foregroundStyle(color.opacity(0.5))
        Spacer()
        Text(endLabel)
          .font(.system(size: 9, weight: .semibold, design: .monospaced))
          .foregroundStyle(color.opacity(0.5))
      }
    }
  }
}

private struct EventLine: View {
  let text: String
  let color: Color
  let muted: Color
  let sz: CGFloat

  init(_ text: String, color: Color, muted: Color, sz: CGFloat = 11) {
    self.text = text; self.color = color; self.muted = muted; self.sz = sz
  }

  var body: some View {
    let parts = text.split(separator: " ", maxSplits: 1).map(String.init)
    let time = parts.first ?? ""
    let title = parts.count > 1 ? parts[1] : text
    HStack(spacing: 6) {
      RoundedRectangle(cornerRadius: 1.5)
        .fill(color)
        .frame(width: 2.5, height: sz + 4)
      Text(time)
        .font(.system(size: sz, weight: .heavy, design: .monospaced))
        .foregroundStyle(color)
      Text(title)
        .font(.system(size: sz, weight: .medium))
        .foregroundStyle(muted)
        .lineLimit(1)
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
    .configurationDisplayName("Trip Countdown")
    .description("Countdown to your next adventure")
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
    let dark = cs == .dark
    Group {
      switch fam {
      case .systemSmall:  Small(d: d, dark: dark)
      case .systemMedium: Medium(d: d, dark: dark)
      case .systemLarge:  Large(d: d, dark: dark)
      case .accessoryCircular:    LockCircle(d: d)
      case .accessoryRectangular: LockRect(d: d)
      case .accessoryInline:      LockInline(d: d)
      default: Medium(d: d, dark: dark)
      }
    }
    .bg(dark: dark, fam: fam)
  }
}

private extension View {
  @ViewBuilder func bg(dark: Bool, fam: WidgetFamily) -> some View {
    if fam == .accessoryCircular || fam == .accessoryRectangular || fam == .accessoryInline {
      self
    } else if #available(iOS 17.0, *) {
      self.containerBackground(for: .widget) { dark ? Color(hex: "#050505") : Color.white }
    } else {
      self.background(dark ? Color(hex: "#050505") : Color.white)
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  SMALL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct Small: View {
  let d: TD
  let dark: Bool
  private var w: Color { dark ? .white : Color(hex: "#111111") }
  private var m: Color { dark ? Color(hex: "#666666") : Color(hex: "#888888") }

  var body: some View {
    switch d.state {
    case "upcoming": upcoming
    case "active":   active
    default:         empty
    }
  }

  private var empty: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        HStack(spacing: 3) {
          Image(systemName: "airplane")
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(d.accent)
          Text("DALEFY")
            .font(.system(size: 8, weight: .heavy))
            .foregroundStyle(d.accent)
            .tracking(1)
        }
        Spacer()
        Image(systemName: "globe.europe.africa.fill")
          .font(.system(size: 28, weight: .ultraLight))
          .foregroundStyle(d.accent.opacity(0.15))
      }
      Spacer()
      Text("Where")
        .font(.system(size: 26, weight: .heavy, design: .rounded))
        .foregroundStyle(w)
      Text("to next?")
        .font(.system(size: 26, weight: .heavy, design: .rounded))
        .foregroundStyle(d.accent)
      Text("Tap to start planning")
        .font(.system(size: 9, weight: .medium))
        .foregroundStyle(m)
        .padding(.top, 2)
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private var upcoming: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text("NEXT TRIP")
        .font(.system(size: 8, weight: .heavy))
        .foregroundStyle(d.accent)
        .tracking(1)

      Spacer()

      Text("\(d.daysLeft)")
        .font(.system(size: 72, weight: .black, design: .rounded))
        .foregroundStyle(d.accent)
        .minimumScaleFactor(0.5)
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.bottom, -16)
      Text(d.daysLeft == 1 ? "DAY TO GO" : "DAYS TO GO")
        .font(.system(size: 9, weight: .heavy))
        .foregroundStyle(m)
        .tracking(0.8)

      Spacer()

      Text(d.name)
        .font(.system(size: 14, weight: .bold))
        .foregroundStyle(w)
        .lineLimit(1)
      Text(d.startDate)
        .font(.system(size: 10, weight: .semibold, design: .monospaced))
        .foregroundStyle(m)
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private var active: some View {
    VStack(spacing: 0) {
      HStack {
        HStack(spacing: 3) {
          Circle().fill(.green).frame(width: 5, height: 5)
          Text("LIVE")
            .font(.system(size: 8, weight: .heavy))
            .foregroundStyle(.green)
            .tracking(1)
        }
        Spacer()
        Text(d.destination)
          .font(.system(size: 9, weight: .bold))
          .foregroundStyle(m)
          .lineLimit(1)
      }

      Spacer()

      ZStack {
        ProgressRing(value: d.progress, color: d.accent, width: 12, size: 90)
        VStack(spacing: -4) {
          Text("\(d.currentDay)")
            .font(.system(size: 38, weight: .black, design: .rounded))
            .foregroundStyle(d.accent)
          Text("OF \(d.totalDays)")
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(m)
            .tracking(0.5)
        }
      }

      Spacer()
    }
    .padding(14)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MEDIUM (two-column departure board)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct Medium: View {
  let d: TD
  let dark: Bool
  private var w: Color { dark ? .white : Color(hex: "#111111") }
  private var m: Color { dark ? Color(hex: "#666666") : Color(hex: "#888888") }
  private var dim: Color { dark ? Color(hex: "#333333") : Color(hex: "#cccccc") }
  private var sep: Color { dark ? Color(hex: "#222222") : Color(hex: "#dddddd") }

  var body: some View {
    switch d.state {
    case "upcoming": upcoming
    case "active":   active
    default:         empty
    }
  }

  private var empty: some View {
    HStack(spacing: 0) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 3) {
          Image(systemName: "airplane")
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(d.accent)
          Text("DALEFY")
            .font(.system(size: 8, weight: .heavy))
            .foregroundStyle(d.accent)
            .tracking(1)
        }
        Spacer()
        Text("Where to")
          .font(.system(size: 24, weight: .heavy, design: .rounded))
          .foregroundStyle(w)
        Text("next?")
          .font(.system(size: 24, weight: .heavy, design: .rounded))
          .foregroundStyle(d.accent)
        Text("Tap to start planning")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(m)
          .padding(.top, 4)
      }
      Spacer()
      VStack {
        Spacer()
        ZStack {
          Circle()
            .stroke(d.accent.opacity(0.08), lineWidth: 3)
            .frame(width: 72, height: 72)
          Image(systemName: "airplane.departure")
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(d.accent.opacity(0.2))
        }
        Spacer()
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var upcoming: some View {
    HStack(spacing: 0) {
      VStack(spacing: -4) {
        Spacer()
        Text("\(d.daysLeft)")
          .font(.system(size: 64, weight: .black, design: .rounded))
          .foregroundStyle(d.accent)
          .minimumScaleFactor(0.6)
          .lineLimit(1)
        Text(d.daysLeft == 1 ? "DAY" : "DAYS")
          .font(.system(size: 11, weight: .heavy))
          .foregroundStyle(m)
          .tracking(1)
        Spacer()
      }
      .frame(width: 100)

      Rectangle()
        .fill(sep)
        .frame(width: 1)
        .padding(.vertical, 8)

      VStack(alignment: .leading, spacing: 0) {
        Text("NEXT TRIP")
          .font(.system(size: 8, weight: .heavy))
          .foregroundStyle(d.accent)
          .tracking(1)

        Spacer().frame(height: 8)

        Text(d.name)
          .font(.system(size: 17, weight: .bold))
          .foregroundStyle(w)
          .lineLimit(2)

        HStack(spacing: 4) {
          Image(systemName: "calendar")
            .font(.system(size: 9, weight: .semibold))
            .foregroundStyle(d.accent)
          Text(d.startDate)
            .font(.system(size: 11, weight: .semibold, design: .monospaced))
            .foregroundStyle(dim)
        }
        .padding(.top, 2)

        Spacer()

        if !d.event1.isEmpty {
          EventLine(d.event1, color: d.accent, muted: m, sz: 10)
        }
      }
      .padding(.leading, 14)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var active: some View {
    HStack(spacing: 0) {
      VStack(spacing: 0) {
        Spacer()
        ZStack {
          ProgressRing(value: d.progress, color: d.accent, width: 12, size: 90)
          VStack(spacing: -4) {
            Text("\(d.currentDay)")
              .font(.system(size: 34, weight: .black, design: .rounded))
              .foregroundStyle(d.accent)
            Text("OF \(d.totalDays)")
              .font(.system(size: 9, weight: .heavy))
              .foregroundStyle(m)
              .tracking(0.5)
          }
        }
        Spacer()
      }
      .frame(width: 110)

      Rectangle()
        .fill(sep)
        .frame(width: 1)
        .padding(.vertical, 8)

      VStack(alignment: .leading, spacing: 0) {
        HStack(spacing: 3) {
          Circle().fill(.green).frame(width: 5, height: 5)
          Text("LIVE")
            .font(.system(size: 8, weight: .heavy))
            .foregroundStyle(.green)
            .tracking(1)
        }

        Text(d.destination)
          .font(.system(size: 15, weight: .bold))
          .foregroundStyle(w)
          .lineLimit(1)
          .padding(.top, 4)

        Spacer().frame(height: 8)

        TripTimeline(
          progress: d.progress,
          startLabel: "DAY 1",
          endLabel: "DAY \(d.totalDays)",
          color: d.accent
        )

        Spacer()

        if !d.event1.isEmpty || !d.event2.isEmpty {
          VStack(alignment: .leading, spacing: 4) {
            if !d.event1.isEmpty {
              EventLine(d.event1, color: d.accent, muted: m, sz: 10)
            }
            if !d.event2.isEmpty {
              EventLine(d.event2, color: d.accent, muted: m, sz: 10)
            }
          }
        }
      }
      .padding(.leading, 14)
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LARGE (full trip dashboard)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct Large: View {
  let d: TD
  let dark: Bool
  private var w: Color { dark ? .white : Color(hex: "#111111") }
  private var m: Color { dark ? Color(hex: "#666666") : Color(hex: "#888888") }
  private var dim: Color { dark ? Color(hex: "#333333") : Color(hex: "#cccccc") }
  private var line: Color { dark ? Color(hex: "#1a1a1a") : Color(hex: "#eeeeee") }

  var body: some View {
    switch d.state {
    case "upcoming": upcoming
    case "active":   active
    default:         empty
    }
  }

  private var empty: some View {
    VStack(spacing: 0) {
      HStack {
        HStack(spacing: 3) {
          Image(systemName: "airplane")
            .font(.system(size: 9, weight: .bold))
            .foregroundStyle(d.accent)
          Text("DALEFY")
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(d.accent)
            .tracking(1)
        }
        Spacer()
      }

      Spacer()

      ZStack {
        Circle()
          .stroke(d.accent.opacity(0.08), lineWidth: 4)
          .frame(width: 100, height: 100)
        Image(systemName: "airplane.departure")
          .font(.system(size: 32, weight: .semibold))
          .foregroundStyle(d.accent.opacity(0.2))
      }
      .padding(.bottom, 20)

      Text("Where to next?")
        .font(.system(size: 30, weight: .heavy, design: .rounded))
        .foregroundStyle(w)
      Text("Tap to start planning your trip")
        .font(.system(size: 13, weight: .medium))
        .foregroundStyle(m)
        .padding(.top, 4)

      Spacer()
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }

  private var upcoming: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        Text("NEXT TRIP")
          .font(.system(size: 9, weight: .heavy))
          .foregroundStyle(d.accent)
          .tracking(1)
        Spacer()
        Text(d.startDate)
          .font(.system(size: 10, weight: .bold, design: .monospaced))
          .foregroundStyle(dim)
      }

      Spacer().frame(height: 14)

      HStack(spacing: 16) {
        ZStack {
          ProgressRing(value: d.countdownProgress, color: d.accent, width: 18, size: 140)
          VStack(spacing: -6) {
            Text("\(d.daysLeft)")
              .font(.system(size: 56, weight: .black, design: .rounded))
              .foregroundStyle(d.accent)
            Text(d.daysLeft == 1 ? "DAY" : "DAYS")
              .font(.system(size: 12, weight: .heavy))
              .foregroundStyle(m)
              .tracking(0.8)
          }
        }

        VStack(alignment: .leading, spacing: 6) {
          Spacer()
          Text(d.name)
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(w)
            .lineLimit(2)
          if !d.startDate.isEmpty {
            HStack(spacing: 4) {
              Image(systemName: "calendar")
                .font(.system(size: 10, weight: .semibold))
                .foregroundStyle(d.accent)
              Text(d.startDate)
                .font(.system(size: 12, weight: .semibold, design: .monospaced))
                .foregroundStyle(dim)
            }
          }
          Spacer()
        }
      }
      .frame(maxWidth: .infinity)

      Rectangle().fill(line).frame(height: 1).padding(.vertical, 14)

      if !d.event1.isEmpty || !d.event2.isEmpty || !d.event3.isEmpty {
        Text("ITINERARY")
          .font(.system(size: 9, weight: .heavy))
          .foregroundStyle(dim)
          .tracking(1)
          .padding(.bottom, 10)

        VStack(alignment: .leading, spacing: 8) {
          if !d.event1.isEmpty { EventLine(d.event1, color: d.accent, muted: m, sz: 13) }
          if !d.event2.isEmpty { EventLine(d.event2, color: d.accent, muted: m, sz: 13) }
          if !d.event3.isEmpty { EventLine(d.event3, color: d.accent, muted: m, sz: 13) }
        }
      }

      Spacer()
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }

  private var active: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack {
        HStack(spacing: 3) {
          Circle().fill(.green).frame(width: 6, height: 6)
          Text("LIVE")
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(.green)
            .tracking(1)
        }
        Spacer()
        Text(d.destination)
          .font(.system(size: 13, weight: .bold))
          .foregroundStyle(w)
      }

      Spacer().frame(height: 14)

      HStack(spacing: 16) {
        ZStack {
          ProgressRing(value: d.progress, color: d.accent, width: 18, size: 140)
          VStack(spacing: -6) {
            Text("Day")
              .font(.system(size: 12, weight: .heavy))
              .foregroundStyle(m)
              .tracking(0.3)
            Text("\(d.currentDay)")
              .font(.system(size: 56, weight: .black, design: .rounded))
              .foregroundStyle(d.accent)
            Text("OF \(d.totalDays)")
              .font(.system(size: 11, weight: .heavy))
              .foregroundStyle(m)
              .tracking(0.5)
          }
        }

        VStack(alignment: .leading, spacing: 8) {
          Spacer()
          Text(d.tripName.isEmpty ? d.destination : d.tripName)
            .font(.system(size: 20, weight: .bold))
            .foregroundStyle(w)
            .lineLimit(2)
          TripTimeline(
            progress: d.progress,
            startLabel: "DAY 1",
            endLabel: "DAY \(d.totalDays)",
            color: d.accent
          )
          Spacer()
        }
      }

      Rectangle().fill(line).frame(height: 1).padding(.vertical, 12)

      if !d.event1.isEmpty || !d.event2.isEmpty || !d.event3.isEmpty {
        Text("TODAY")
          .font(.system(size: 9, weight: .heavy))
          .foregroundStyle(dim)
          .tracking(1)
          .padding(.bottom, 10)

        VStack(alignment: .leading, spacing: 8) {
          if !d.event1.isEmpty { EventLine(d.event1, color: d.accent, muted: m, sz: 13) }
          if !d.event2.isEmpty { EventLine(d.event2, color: d.accent, muted: m, sz: 13) }
          if !d.event3.isEmpty { EventLine(d.event3, color: d.accent, muted: m, sz: 13) }
        }
      }

      Spacer()
    }
    .padding(16)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  LOCK SCREEN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct LockCircle: View {
  let d: TD
  var body: some View {
    switch d.state {
    case "upcoming":
      ZStack {
        AccessoryWidgetBackground()
        ProgressRing(value: d.countdownProgress, color: .white, width: 3, size: 44)
        Text("\(d.daysLeft)")
          .font(.system(size: 16, weight: .black, design: .rounded))
      }
    case "active":
      ZStack {
        AccessoryWidgetBackground()
        ProgressRing(value: d.progress, color: .white, width: 3, size: 44)
        VStack(spacing: -2) {
          Text("\(d.currentDay)")
            .font(.system(size: 14, weight: .black, design: .rounded))
          Text("/\(d.totalDays)")
            .font(.system(size: 8, weight: .semibold))
            .foregroundStyle(.secondary)
        }
      }
    default:
      ZStack {
        AccessoryWidgetBackground()
        Image(systemName: "airplane")
          .font(.system(size: 16, weight: .semibold))
          .foregroundStyle(.secondary)
      }
    }
  }
}

private struct LockRect: View {
  let d: TD
  var body: some View {
    switch d.state {
    case "upcoming":
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 3) {
          Image(systemName: "airplane.departure").font(.system(size: 8, weight: .bold))
          Text("\(d.daysLeft) \(d.daysLeft == 1 ? "DAY" : "DAYS")").font(.system(size: 9, weight: .heavy)).tracking(0.3)
        }
        Text(d.name).font(.system(size: 13, weight: .bold)).lineLimit(1)
        Text(d.startDate).font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
      }.frame(maxWidth: .infinity, alignment: .leading)
    case "active":
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 3) {
          Circle().fill(.green).frame(width: 5, height: 5)
          Text("DAY \(d.currentDay)/\(d.totalDays)").font(.system(size: 9, weight: .heavy)).tracking(0.3)
        }
        Text(d.destination).font(.system(size: 13, weight: .bold)).lineLimit(1)
        if !d.event1.isEmpty {
          Text(d.event1).font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary).lineLimit(1)
        }
      }.frame(maxWidth: .infinity, alignment: .leading)
    default:
      VStack(alignment: .leading, spacing: 1) {
        HStack(spacing: 3) {
          Image(systemName: "airplane").font(.system(size: 8, weight: .bold))
          Text("DALEFY").font(.system(size: 9, weight: .heavy)).tracking(0.3)
        }
        Text("No trips planned").font(.system(size: 13, weight: .bold))
        Text("Tap to plan one").font(.system(size: 10, weight: .medium)).foregroundStyle(.secondary)
      }.frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

private struct LockInline: View {
  let d: TD
  var body: some View {
    switch d.state {
    case "upcoming":
      HStack(spacing: 4) {
        Image(systemName: "airplane.departure")
        Text("\(d.name) in \(d.daysLeft) days")
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
    return "ON TIME"
  }

  var statusColor: Color {
    let s = status.lowercased()
    if s.contains("cancel") { return Color(hex: "#ef4444") }
    if s.contains("delay") { return Color(hex: "#f59e0b") }
    if s.contains("landed") || s.contains("arrived") { return Color(hex: "#22c55e") }
    if s.contains("boarding") { return teal }
    if s.contains("in flight") || s.contains("airborne") { return Color(hex: "#3b82f6") }
    return Color(hex: "#22c55e")
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

  var typeLabel: String { type.uppercased() }
  var displayTitle: String { shortTitle.isEmpty ? title : shortTitle }

  init(_ d: [String: Any]) {
    title      = d["title"] as? String ?? ""
    shortTitle = d["shortTitle"] as? String ?? ""
    type       = d["type"] as? String ?? "activity"
    time       = d["time"] as? String ?? ""
    location   = d["location"] as? String ?? ""
    icon       = d["icon"] as? String ?? "calendar"
  }
}

private let teal = Color(hex: "#0bd2b5")


private func parse(_ json: String) -> [String: Any] {
  guard let data = json.data(using: .utf8),
        let dict = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
  else { return [:] }
  return dict
}

// MARK: - Airline Monogram

private let airlineColors: [String: String] = [
  "BA": "#075AAA", "AA": "#0D2C6C", "DL": "#003366", "UA": "#002244",
  "EK": "#D71921", "QR": "#5C0632", "SQ": "#1A3263", "LH": "#00276E",
  "AF": "#002157", "QF": "#E0282D", "CX": "#006564", "TK": "#C8102E",
  "EY": "#BD8B13", "JL": "#C8102E", "NH": "#13448F", "KE": "#00467F",
  "OZ": "#008FD5", "VS": "#E40028", "WN": "#304CB2", "B6": "#003876",
  "FR": "#073590", "U2": "#FF6600", "W6": "#C6007E",
]

private struct AirlineMonogram: View {
  let code: String
  let size: CGFloat
  private var brandColor: Color {
    if let hex = airlineColors[code] { return Color(hex: hex) }
    return teal
  }
  var body: some View {
    Text(code)
      .font(.system(size: size * 0.38, weight: .heavy))
      .foregroundStyle(.white)
      .frame(width: size, height: size)
      .background(brandColor, in: Circle())
  }
}

// MARK: - Flight Arc

private struct FlightArc: Shape {
  func path(in rect: CGRect) -> Path {
    var p = Path()
    p.move(to: CGPoint(x: rect.minX, y: rect.maxY))
    p.addQuadCurve(
      to: CGPoint(x: rect.maxX, y: rect.maxY),
      control: CGPoint(x: rect.midX, y: rect.minY - rect.height * 0.2)
    )
    return p
  }
}

private struct FlightArcView: View {
  let progress: Double
  var body: some View {
    GeometryReader { geo in
      let r = geo.frame(in: .local)
      let h = r.height * 1.2
      ZStack {
        FlightArc()
          .stroke(Color.white.opacity(0.1), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
        FlightArc()
          .trim(from: 0, to: max(0.01, progress))
          .stroke(teal, style: StrokeStyle(lineWidth: 2, lineCap: .round))
        let t = max(0.01, progress)
        let px = r.minX + r.width * t
        let py = r.maxY - 4 * h * t * (1 - t) / r.height * r.height / 4
        Circle().fill(Color.white.opacity(0.3)).frame(width: 4, height: 4)
          .position(x: r.minX, y: r.maxY)
        Circle().fill(Color.white.opacity(0.3)).frame(width: 4, height: 4)
          .position(x: r.maxX, y: r.maxY)
        Image(systemName: "airplane")
          .font(.system(size: 10, weight: .bold))
          .foregroundStyle(teal)
          .rotationEffect(.degrees(-40 + 80 * t))
          .position(x: px, y: py)
      }
    }
  }
}

// MARK: - Widget

struct NativeLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LiveActivityAttributes.self) { ctx in
      let n = ctx.state.name
      let p = parse(ctx.state.props)
      BannerView(name: n, props: p)
        .padding(.horizontal, 20)
        .padding(.vertical, 14)
        .activityBackgroundTint(Color(hex: "#050505"))
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
    VStack(spacing: 0) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 0) {
          HStack(spacing: 6) {
            AirlineMonogram(code: p.airlineCode, size: 20)
            Text(p.flightNum)
              .font(.system(size: 10, weight: .heavy, design: .monospaced))
              .foregroundStyle(Color.white.opacity(0.4))
              .tracking(0.5)
          }
          Text(p.from)
            .font(.system(size: 34, weight: .black, design: .rounded))
            .foregroundStyle(.white)
          Text(p.departTime)
            .font(.system(size: 13, weight: .semibold, design: .monospaced))
            .foregroundStyle(Color.white.opacity(0.6))
        }
        Spacer()
        VStack(spacing: 4) {
          if !p.duration.isEmpty {
            Text(p.duration)
              .font(.system(size: 9, weight: .heavy, design: .monospaced))
              .foregroundStyle(teal)
              .tracking(0.3)
              .padding(.horizontal, 8)
              .padding(.vertical, 3)
              .background(teal.opacity(0.1), in: Capsule())
          }
          Text(p.statusLabel)
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(p.statusColor)
            .tracking(0.3)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(p.statusColor.opacity(0.1), in: Capsule())
        }
        Spacer()
        VStack(alignment: .trailing, spacing: 0) {
          Text(p.airline.isEmpty ? " " : p.airline.uppercased())
            .font(.system(size: 10, weight: .heavy))
            .foregroundStyle(Color.white.opacity(0.4))
            .tracking(0.5)
          Text(p.to)
            .font(.system(size: 34, weight: .black, design: .rounded))
            .foregroundStyle(.white)
          Text(p.arriveTime)
            .font(.system(size: 13, weight: .semibold, design: .monospaced))
            .foregroundStyle(Color.white.opacity(0.6))
        }
      }

      FlightArcView(progress: p.progress)
        .frame(height: 28)
        .padding(.horizontal, 8)
        .padding(.top, 6)

      if !p.gate.isEmpty {
        HStack {
          Spacer()
          Text("GATE")
            .font(.system(size: 8, weight: .heavy))
            .foregroundStyle(Color.white.opacity(0.4))
            .tracking(1)
          Text(p.gate)
            .font(.system(size: 14, weight: .bold))
            .foregroundStyle(teal)
          Spacer()
        }
        .padding(.top, 6)
      }
    }
  }
}

private struct EventBanner: View {
  let p: EventProps
  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(alignment: .top) {
        VStack(alignment: .leading, spacing: 2) {
          Text(p.time)
            .font(.system(size: 28, weight: .black, design: .rounded))
            .foregroundStyle(teal)
          Text("STARTS")
            .font(.system(size: 8, weight: .heavy))
            .foregroundStyle(Color.white.opacity(0.4))
            .tracking(1)
        }

        Spacer()

        HStack(spacing: 5) {
          Image(systemName: p.icon)
            .font(.system(size: 10, weight: .bold))
            .foregroundStyle(teal)
          Text(p.typeLabel)
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(teal)
            .tracking(0.8)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(teal.opacity(0.1), in: Capsule())
      }

      Text(p.title)
        .font(.system(size: 22, weight: .bold))
        .foregroundStyle(.white)
        .lineLimit(2)
        .padding(.top, 10)

      if !p.location.isEmpty {
        HStack(spacing: 5) {
          Image(systemName: "mappin.circle.fill")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(teal)
          Text(p.location)
            .font(.system(size: 12, weight: .medium))
            .foregroundStyle(Color.white.opacity(0.6))
            .lineLimit(1)
        }
        .padding(.top, 8)
      }
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  COMPACT (Dynamic Island pill)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct CmpLeading: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      HStack(spacing: 4) {
        AirlineMonogram(code: p.airlineCode, size: 16)
        Text(p.from)
          .font(.system(size: 14, weight: .heavy, design: .rounded))
      }
    } else {
      let p = EventProps(props)
      HStack(spacing: 4) {
        Image(systemName: p.icon)
          .font(.system(size: 9, weight: .bold))
          .foregroundStyle(teal)
        Text(p.time)
          .font(.system(size: 13, weight: .heavy, design: .monospaced))
      }
    }
  }
}

private struct CmpTrailing: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      Text(p.to)
        .font(.system(size: 14, weight: .heavy, design: .rounded))
    } else {
      let p = EventProps(props)
      Text(p.displayTitle)
        .font(.system(size: 12, weight: .bold))
        .foregroundStyle(Color.white.opacity(0.6))
        .lineLimit(1)
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MINIMAL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct MinView: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      Image(systemName: "airplane")
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(teal)
    } else {
      let p = EventProps(props)
      Image(systemName: p.icon)
        .font(.system(size: 11, weight: .bold))
        .foregroundStyle(teal)
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  EXPANDED Dynamic Island
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

private struct ExLeading: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      VStack(alignment: .leading, spacing: 2) {
        Text(p.from)
          .font(.system(size: 22, weight: .black, design: .rounded))
          .foregroundStyle(.white)
        Text(p.departTime)
          .font(.system(size: 11, weight: .semibold, design: .monospaced))
          .foregroundStyle(Color.white.opacity(0.6))
      }
      .padding(12)
    } else {
      let p = EventProps(props)
      VStack(alignment: .leading, spacing: 2) {
        Text(p.time)
          .font(.system(size: 22, weight: .black, design: .rounded))
          .foregroundStyle(teal)
        Text("STARTS")
          .font(.system(size: 8, weight: .heavy))
          .foregroundStyle(Color.white.opacity(0.4))
          .tracking(1)
      }
      .padding(12)
    }
  }
}

private struct ExTrailing: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      VStack(alignment: .trailing, spacing: 2) {
        Text(p.to)
          .font(.system(size: 22, weight: .black, design: .rounded))
          .foregroundStyle(.white)
        Text(p.arriveTime)
          .font(.system(size: 11, weight: .semibold, design: .monospaced))
          .foregroundStyle(Color.white.opacity(0.6))
      }
      .padding(12)
    } else {
      let p = EventProps(props)
      VStack(alignment: .trailing, spacing: 2) {
        HStack(spacing: 3) {
          Image(systemName: p.icon)
            .font(.system(size: 8, weight: .bold))
            .foregroundStyle(teal)
          Text(p.typeLabel)
            .font(.system(size: 8, weight: .heavy))
            .foregroundStyle(teal)
            .lineLimit(1)
            .fixedSize()
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 3)
        .background(teal.opacity(0.1), in: Capsule())
      }
      .padding(12)
    }
  }
}

private struct ExCenter: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      if !p.duration.isEmpty {
        Text(p.duration)
          .font(.system(size: 9, weight: .heavy, design: .monospaced))
          .foregroundStyle(teal)
          .padding(.top, 14)
      }
    } else {
      let p = EventProps(props)
      Text(p.displayTitle)
        .font(.system(size: 18, weight: .bold))
        .foregroundStyle(.white)
        .lineLimit(1)
        .padding(.horizontal, 8)
        .padding(.top, 6)
    }
  }
}

private struct ExBottom: View {
  let name: String
  let props: [String: Any]
  var body: some View {
    if name == "FlightTracker" {
      let p = FlightProps(props)
      VStack(spacing: 6) {
        FlightArcView(progress: p.progress)
          .frame(height: 22)
          .padding(.horizontal, 8)

        HStack {
          Text(p.statusLabel)
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(p.statusColor)
            .tracking(0.3)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(p.statusColor.opacity(0.1), in: Capsule())
          Spacer()
          if !p.gate.isEmpty {
            HStack(spacing: 3) {
              Text("GATE")
                .font(.system(size: 8, weight: .heavy))
                .foregroundStyle(Color.white.opacity(0.4))
                .tracking(0.5)
              Text(p.gate)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(teal)
            }
          }
          Spacer()
          HStack(spacing: 4) {
            AirlineMonogram(code: p.airlineCode, size: 16)
            Text(p.flightNum)
              .font(.system(size: 10, weight: .bold, design: .monospaced))
              .foregroundStyle(Color.white.opacity(0.4))
          }
        }
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 4)
    } else {
      let p = EventProps(props)
      HStack {
        if !p.location.isEmpty {
          HStack(spacing: 4) {
            Image(systemName: "mappin.circle.fill")
              .font(.system(size: 10, weight: .semibold))
              .foregroundStyle(teal)
            Text(p.location.count > 28 ? String(p.location.prefix(26)) + "..." : p.location)
              .font(.system(size: 10, weight: .medium))
              .foregroundStyle(Color.white.opacity(0.6))
              .lineLimit(1)
          }
        }
        Spacer()
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 4)
    }
  }
}
