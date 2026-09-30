import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ModalBackdrop, ModalContainer, ModalHeader, ModalBody, ModalFooter } from './ui/Dialog';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, shareUrl }) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy", err);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <ModalBackdrop onClick={onClose} className="z-[100]">
          <ModalContainer>
            <ModalHeader>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary !text-[18px]">share</span>
                <h3 className="font-medium text-white text-base">Share Zcene</h3>
              </div>
              <button 
                onClick={onClose}
                className="text-zinc-500 hover:text-white transition-colors p-1"
              >
                <span className="material-symbols-outlined !text-[18px]">close</span>
              </button>
            </ModalHeader>

            <ModalBody className="space-y-4">
              <p className="leading-relaxed">
                Anyone with the link can view this read-only snapshot. 
                <span className="block mt-1 text-zinc-400 text-sm">
                  Note: Shared links are ephemeral and automatically expire after 30 days.
                </span>
              </p>

              <div className="relative flex items-center gap-3 bg-zinc-950 border border-zinc-800 rounded-xl p-3 overflow-hidden group">
                <span className="material-symbols-outlined text-zinc-500 !text-[18px]">link</span>
                <input 
                  readOnly 
                  value={shareUrl}
                  className="flex-1 bg-transparent text-zinc-300 text-sm outline-none font-mono truncate"
                />
                <button 
                  onClick={handleCopy}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    copied 
                    ? 'bg-[#10b981] text-brand-black' 
                    : 'bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </ModalBody>

            <ModalFooter>
              <button 
                onClick={onClose}
                className="px-6 py-1.5 bg-white text-brand-black rounded-xl font-medium text-sm hover:opacity-90 transition-opacity"
              >
                Done
              </button>
            </ModalFooter>
          </ModalContainer>
        </ModalBackdrop>
      )}
    </AnimatePresence>
  );
};
