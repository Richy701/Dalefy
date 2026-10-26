import ExpoModulesCore
import QuickLook

/// Shows a local file in the system Quick Look viewer, over the app, with share, markup and print.
public class DalefyQuickLookModule: Module {
  // QLPreviewController holds its data source weakly; keep it alive while the preview is up
  private var source: PreviewSource?

  public func definition() -> ModuleDefinition {
    Name("DalefyQuickLook")

    AsyncFunction("preview") { (path: String, title: String?) in
      let url = path.hasPrefix("file://") ? URL(string: path)! : URL(fileURLWithPath: path)
      guard let presenter = Self.topViewController() else {
        throw NoPresenterException()
      }
      let source = PreviewSource(url: url, title: title)
      source.onDismiss = { [weak self] in self?.source = nil }
      self.source = source
      let controller = QLPreviewController()
      controller.dataSource = source
      controller.delegate = source
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)
  }

  private static func topViewController() -> UIViewController? {
    let scene = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .first { $0.activationState == .foregroundActive }
    var top = scene?.windows.first { $0.isKeyWindow }?.rootViewController
    while let presented = top?.presentedViewController, !presented.isBeingDismissed {
      top = presented
    }
    return top
  }
}

private final class PreviewSource: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  let item: Item
  var onDismiss: (() -> Void)?

  init(url: URL, title: String?) {
    item = Item(url: url, title: title)
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { item }

  func previewControllerDidDismiss(_ controller: QLPreviewController) { onDismiss?() }

  final class Item: NSObject, QLPreviewItem {
    let previewItemURL: URL?
    let previewItemTitle: String?
    init(url: URL, title: String?) {
      previewItemURL = url
      previewItemTitle = title
    }
  }
}

private final class NoPresenterException: Exception, @unchecked Sendable {
  override var reason: String { "No screen to present the preview from" }
}
