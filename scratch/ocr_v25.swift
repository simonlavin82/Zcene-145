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

let request = VNRecognizeTextRequest { (request, error) in
    guard let observations = request.results as? [VNRecognizedTextObservation] else { return }
    var textResults: [(CGRect, String)] = []
    for observation in observations {
        guard let candidate = observation.topCandidates(1).first else { continue }
        textResults.append((observation.boundingBox, candidate.string))
    }
    
    textResults.sort { a, b in
        if abs(a.0.origin.y - b.0.origin.y) > 0.008 {
            return a.0.origin.y > b.0.origin.y
        }
        return a.0.origin.x < b.0.origin.x
    }
    
    print("=== DUMPING MATCHES ===")
    for (box, text) in textResults {
        let l = text.lowercased()
        if l.contains("17.") || l.contains("node 17") || l.contains("router") || l.contains("rule 36") || l.contains("taxonomy") || l.contains("stub") || l.contains("slug") {
            print("[\(String(format: "%.3f", box.origin.x)), \(String(format: "%.3f", box.origin.y))] \(text)")
        }
    }
}

request.recognitionLevel = .accurate
let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
try? handler.perform([request])
