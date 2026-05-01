import WidgetKit
import SwiftUI
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
