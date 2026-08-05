with open('components/EnginePage.tsx', 'r') as f:
    content = f.read()

target = """    - Interactive Select UI: Dynamic queries utilize a styled native `<select>` dropdown masked as a standard query chip, allowing users to intuitively cross-examine any graph peer directly from their active context window.
`;"""

replacement = """    - Interactive Select UI: Dynamic queries utilize a styled native `<select>` dropdown masked as a standard query chip, allowing users to intuitively cross-examine any graph peer directly from their active context window.

15. NETWORK STREAMING & DECOMPRESSION FIX:
    - The browser fetch for Live AI generation was aborting precisely due to 'ERR_CONTENT_DECODING_FAILED'.
    - Root Cause: The local proxy (server.js) or Node fetch client was aggressively compressing streams without properly syncing headers.
    - Fix: We implemented explicit header sanitization in the proxy middleware by stripping 'accept-encoding' and 'content-length' before forwarding requests to the Gemini API, ensuring clean decompression of chunked streams.

16. STRICT UI DIALOG ARCHITECTURE:
    - SharedModals.tsx previously contained inline, unstandardized HTML for modals that drifted from our design spec.
    - Fix: We extracted the mandatory dialog primitives into components/ui/Dialog.tsx (ModalBackdrop, ModalContainer, ModalHeader, ModalBody, ModalFooter).
    - Rule: All future modals must strictly import and compose these primitives to maintain the rigid 0px border-radius, background darkness, and animate-fade-in-down timing, acting as the Single Source of Truth.
`;"""

if target in content:
    content = content.replace(target, replacement)
    with open('components/EnginePage.tsx', 'w') as f:
        f.write(content)
    print("Success")
else:
    print("Failed to find target string")
