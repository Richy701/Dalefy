import SwiftUI
import WidgetKit
import ActivityKit
internal import ExpoWidgets

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

// MARK: - Shared

private let teal = Color(hex: "#0bd2b5")

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
