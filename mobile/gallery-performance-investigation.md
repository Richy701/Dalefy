# Gallery physical-iPhone investigation, 14 September 2026

The measured bottleneck was synchronous bitmap resizing on the iPhone. The final fix adds `allowDownscaling={false}` to the animated hero and full-screen page images in `app/(tabs)/media/index.tsx`. No animation, gesture, layout, modal, gradient, grid, or data behavior was removed. Temporary probes have been removed from the production source and saved separately for reproduction.

## Ranked causes and evidence

1. **Hero bitmap resizing during animated bounds changes.** A 45.867752-second Time Profiler capture of installed build 67 on the physical iPhone 15 Pro, iOS 27.0 (24A435), contained 20,583 ms of sampled main-thread work. Of this, 17,431 ms, about 84.7%, included `resize(image:toSize:scale:)`. Within that, 13,483 ms also included `ImageView.bounds.setter` and Fabric `updateLayoutMetrics`. These are inclusive statistical CPU sample weights across repeated interactions, not individual opening latencies. A representative stack is shown below. The trace does not identify individual image-view instances; the subsequent hero-only intervention isolates the hero's contribution.
2. **Full-screen page bitmap resizing left a remaining hitch.** Disabling downscaling only on the hero reduced repeated frame stalls but left one gap over 34 ms per opening. The user reported that it was better but staggered. Disabling downscaling on the page images as well removed those measured long gaps in the final three captured openings; the user reported it fixed. The pager can mount neighboring images too, so this experiment does not distinguish the active page from its neighbors.
3. **Server latency, JS measurement, modal/tab presentation, cache thrashing and gradients were not established as primary causes.** All compared full-image load events reported memory-cache hits. Tile measurement was sub-millisecond in most runs. The unchanged modal and gradients were present in the final smooth run. This does not rule out network delay for an uncached photo or a separate issue under memory pressure.

```text
CA::Display::DisplayLink::callback
Hermes worklet execution (some app frames lack symbols)
ShadowTree::commit
RCTMountingManager performTransaction
RCTViewComponentView updateLayoutMetrics
ImageView.bounds.setter
ImageView.reload(force:)
SDImageCache queryCacheOperationForKey
SDWebImageManager callCompletionBlockForOperation
ImageView.imageLoadCompleted
ImageView.processImage
resize(image:toSize:scale:)
UIGraphicsImageRenderer imageWithActions
CoreGraphics pixel conversion / rasterization / resampling
```

## Before and after on the same physical phone

The comparison used the same signed Debug development client, EAS build `c9dd9db1-494d-432d-bc22-6269eed120ec`, with the same timing probes enabled. The user was asked to repeatedly open and close the same large photo. Source settings were changed between runs and the app restarted. The tested photos were original-only, without thumbnails. These measurements should not be presented as Release benchmarks or controlled cold-network tests.

Medians, milliseconds unless otherwise stated:

| Measurement | Original, 8 opens | Hero only, 10 opens | Hero and pages, 3 opens |
| --- | ---: | ---: | ---: |
| Tap to tile measurement callback | 0.15 | 0.25 | 0.30 |
| Tap to viewer effect | 54.75 | 56.10 | 61.20 |
| Tap to modal onShow | 259.70 | 165.90 | 85.30 |
| Tap to full-image onLoad | 253.10 | 164.10 | 79.10 |
| Tap to full-image onDisplay | 253.10 | 164.15 | 79.20 |
| Tap to spring completion received on JS | 1,644.30 | 989.35 | 830.70 |
| Tap to hero hide request | 1,678.60 | 1,028.05 | 865.40 |
| Worst measured frame interval per opening | 238.22 | 147.04 | 8.34 |
| Measured intervals over 34 ms per opening | 12 | 1 | 0 |

Final-run worst intervals ranged from 8.34 to 16.67 ms. No interval over 34 ms was recorded in those three final runs. Median tap-to-hero-hide time fell about 48%. The same spring parameters are retained, so the remaining duration includes the intended spring settling time.

Limitations: timeline marks are JS callback receipt/request times, not exact native or GPU presentation times. The Reanimated frame probe measures callback intervals after opening starts, excludes the delay before its first sampled frame, and is not a Core Animation dropped-frame counter. After installing the development client, Instruments reported the phone offline and a new capture timed out, although devicectl and Metro remained connected. Consequently there is no final CPU-stack or GPU trace comparison. The original device CPU trace, three-stage frame/timing experiment, and user confirmation support the fix, but broad memory-pressure, cold-network, orientation and gesture regression testing was not performed. Gesture code and layout were not edited.

## Why this fix

Installed expo-image source defaults `allowDownscaling` to true. Its `bounds.didSet` reloads an image when its nonzero size changes. Image completion calculates an ideal size using content fit and screen scale, then `processImage` can create a resized bitmap with `UIGraphicsImageRenderer`. This is separate from the image view scaling its displayed content.

Disabling that CPU resize branch leaves `contentFit="cover"` on the hero and `contentFit="contain"` on pages. The image view still scales the image for display. The existing border radius interpolation, hero spring, return animation, dismissY scaling, pagination, pinch, double-tap, chrome and modal are preserved.

This is a small intervention at the measured expensive branch. It retains source-resolution bitmaps for viewer display, which can use more memory than downscaled copies. The grid's downscaling and all cache policies remain unchanged. Memory impact has not been measured. Thumbnail backfill remains worthwhile for reducing source size and network demand.

The originally requested transform experiment was not performed. Device evidence led to testing the narrower resize setting first. A transform rewrite would need extra cropping compensation to avoid stretching the photo when tile and fitted-image aspect ratios differ. It is not necessary to remove the measured stutter in these tests. Layout/reload overhead still exists, but no long frame gap was measured in the final runs.

## Source verification

- `node_modules/expo-image/ios/ImageView.swift`: bounds-triggered reload, true default for allowDownscaling, ideal-size calculation, processImage, onLoad before processing and onDisplay after assignment.
- `node_modules/expo-image/ios/Utils/ImageUtils.swift`: shouldDownscale compares source pixels with display pixels; resize uses UIGraphicsImageRenderer and image.draw. `contain` participates in ideal-size calculation.
- Early thumbnail decoding is gated by enforceEarlyResizing, tinting, or a photo-library asset. Adding allowDownscaling=true would merely restate the default.
- The installed pod is a prebuilt framework; the package podspec requests SDWebImage ~> 5.21.0. Upstream uses a background coder queue for downloaded-image decoding and defaults completion to the main queue. The device trace independently confirms completion and resizing on the main thread in this build. [Downloader source](https://github.com/SDWebImage/SDWebImage/blob/5.21.0/SDWebImage/Core/SDWebImageDownloaderOperation.m), [manager source](https://github.com/SDWebImage/SDWebImage/blob/5.21.0/SDWebImage/Core/SDWebImageManager.m).
- No app-level image-cache size configuration was found. The upstream default does not initialize a positive memory-cost limit. This is not evidence of actual occupancy or eviction on this phone. [Cache configuration](https://github.com/SDWebImage/SDWebImage/blob/5.21.0/SDWebImage/Core/SDImageCacheConfig.m).
- [Reanimated performance guidance](https://docs.swmansion.com/react-native-reanimated/docs/guides/performance/) confirms that animated layout properties require layout recalculation.

## Reproduction artifacts and validation

- `/tmp/dalefy-gallery-baseline-time-pid.trace`: original physical-device CPU trace.
- `/tmp/dalefy-gallery-baseline-samples.xml`: exported CPU stacks.
- `/tmp/dalefy-gallery-baseline-summary.json`: CPU summary.
- `/tmp/dalefy-gallery-resize-stack.json`: bounds-linked stack evidence.
- `/tmp/dalefy-gallery-dev-before-events.jsonl`: instrumented original behavior.
- `/tmp/dalefy-gallery-hero-only-events.jsonl`: first intervention.
- `/tmp/dalefy-gallery-both-events.jsonl`: final intervention.
- `/tmp/dalefy-gallery-comparison.json`: per-opening data and summary statistics.
- `/tmp/dalefy-gallery-instrumented.tsx`: temporary opt-in probe source, enabled with EXPO_PUBLIC_GALLERY_PERF=1. This is an investigation snapshot, not a replacement for future edited code.

TypeScript and git diff whitespace checks pass. No packages were added. No production deployment or App Store submission was made. The development client was installed on the user's iPhone; development signing profiles were created for the app and widget on the user-selected Richmond Lamptey team.

## Data changes, separate

The planned thumbnail backfill for existing media was not run. No media records or files were changed. The 118-photo trip was not treated as proof that all 118 decoded originals are resident in memory.
