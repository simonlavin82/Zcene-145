import Foundation
import Vision
import AppKit

let imagePath = "/Users/simonlavin/Desktop/Zcene Architecture V25.jpg"
guard let image = NSImage(contentsOfFile: imagePath),
      let tiffData = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiffData),
      let cgImage = bitmap.cgImage else {
    print("Failed to load image")
    exit(1)
}

let width = cgImage.width
let height = cgImage.height
print("Image size: \(width) x \(height)")

func ocrRect(name: String, rect: CGRect) {
    guard let cropped = cgImage.cropping(to: rect) else {
        print("Failed to crop \(name)")
        return
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    let handler = VNImageRequestHandler(cgImage: cropped, options: [:])
    try? handler.perform([request])
    let results = request.results ?? []
    print("\n=== \(name) (Found \(results.count) lines) ===")
    for obs in results {
        if let str = obs.topCandidates(1).first?.string {
            print(str)
        }
    }
}

// Column 2 middle (Node 17)
// Height is 12435. Let's crop Column 2 from y: 2000 to 4500, x: 1800 to 3400
ocrRect(name: "Column 2 (Top/Mid)", rect: CGRect(x: 1800, y: 1500, width: 1600, height: 3500))

// Rule Ledger bottom (Rule 36)
// Rule ledger is on the right: x: 3800 to 6500, y: 4000 to 10000
ocrRect(name: "Rule Ledger (Mid/Bottom)", rect: CGRect(x: 3900, y: 4000, width: 2600, height: 7500))
