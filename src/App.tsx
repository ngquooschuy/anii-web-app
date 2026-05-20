import { useState, useRef, useEffect, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Heart } from 'lucide-react';

const API_URL = 'https://photobooth-masonry-be.vercel.app/api/images?max=100';

// Fallback images removed - only show API images
const FALLBACK_IMAGES: string[] = [];

interface ImageItem {
  id: string;
  url: string;
  width: number;
  height: number;
}

/** Resize Cloudinary URL to a smaller width for performance */
function optimizeCloudinaryUrl(url: string, width = 400): string {
  // Insert w_<width>,q_auto,f_auto transform into Cloudinary URL
  // Format: .../upload/v123/... → .../upload/w_400,q_auto,f_auto/v123/...
  return url.replace('/upload/', `/upload/w_${width},q_auto,f_auto/`);
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function distributeToColumns(images: string[], numCols: number): string[][] {
  const cols: string[][] = Array.from({ length: numCols }, () => []);
  const shuffled = shuffleArray(images);
  shuffled.forEach((img, i) => {
    cols[i % numCols].push(img);
  });
  // Ensure each column has at least 5 images for smooth looping
  return cols.map(col => {
    while (col.length < 5) {
      col.push(...shuffleArray(images).slice(0, 5 - col.length));
    }
    return col;
  });
}

const ColumnBlock = memo(({ images }: { images: string[] }) => (
  <div className="flex flex-col gap-[clamp(12px,3vw,32px)] pb-[clamp(12px,3vw,32px)]">
    {images.map((src, i) => (
      <div
        key={i}
        className="w-full aspect-[3/4] rounded-[clamp(12px,1.5vw,24px)] shadow-xl opacity-90 bg-cover bg-center"
        style={{ backgroundImage: `url(${src})` }}
      />
    ))}
  </div>
));

/** Uses pure CSS animation for GPU-accelerated infinite scroll instead of Framer Motion */
const FilmColumn = memo(({ images, reverse, duration }: { images: string[]; reverse?: boolean; duration: number }) => {
  return (
    <div className="w-[clamp(140px,25vw,280px)] flex-shrink-0 will-change-transform">
      <div
        className={reverse ? 'film-scroll-reverse' : 'film-scroll'}
        style={{ animationDuration: `${duration}s` }}
      >
        <ColumnBlock images={images} />
        <ColumnBlock images={images} />
      </div>
    </div>
  );
});

export default function App() {
  const [view, setView] = useState<'invitation' | 'rsvp'>('invitation');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [showPopup, setShowPopup] = useState(true);
  const [noPosition, setNoPosition] = useState({ x: 0, y: 0 });
  const noBtnRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [columns, setColumns] = useState<string[][]>([]);

  useEffect(() => {
    fetch(API_URL)
      .then(res => res.json())
      .then((data: { items: ImageItem[] }) => {
        if (data?.items && data.items.length > 0) {
          const urls = data.items.map(img => optimizeCloudinaryUrl(img.url, 600));
          // Preload all images before displaying
          let loaded = 0;
          const total = urls.length;
          const onAllLoaded = () => {
            setColumns(distributeToColumns(urls, 10));
          };
          urls.forEach(url => {
            const img = new Image();
            img.src = url;
            img.onload = img.onerror = () => {
              loaded++;
              if (loaded >= total) onAllLoaded();
            };
          });
        }
      })
      .catch(() => { });
  }, []);

  const handleNoHover = () => {
    if (typeof window === 'undefined' || !noBtnRef.current) return;

    const btn = noBtnRef.current;
    const rect = btn.getBoundingClientRect();
    const btnWidth = rect.width;
    const btnHeight = rect.height;

    // The button's original (non-translated) center position
    const originX = rect.left + btnWidth / 2 - noPosition.x;
    const originY = rect.top + btnHeight / 2 - noPosition.y;

    const padding = 20; // keep at least 20px from screen edges
    // Calculate how far the button can move in each direction without going off-screen
    const minX = -(originX - btnWidth / 2 - padding);
    const maxX = window.innerWidth - originX - btnWidth / 2 - padding;
    const minY = -(originY - btnHeight / 2 - padding);
    const maxY = window.innerHeight - originY - btnHeight / 2 - padding;

    // Generate a random position within the safe bounds, but at least 80px away from current
    let newX: number, newY: number;
    let attempts = 0;
    do {
      newX = minX + Math.random() * (maxX - minX);
      newY = minY + Math.random() * (maxY - minY);
      attempts++;
    } while (
      attempts < 10 &&
      Math.abs(newX - noPosition.x) < 80 &&
      Math.abs(newY - noPosition.y) < 80
    );

    setNoPosition({ x: newX, y: newY });
  };

  const handleSubmit = async () => {
    try {
      const res = await fetch('https://photobooth-masonry-be.vercel.app/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isConfirm: true }),
      });
      const data = await res.json();
      if (data.success) {
        setIsSubmitted(true);
      }
    } catch {
      // silently fail
    }
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    if (audioRef.current) {
      audioRef.current.play().catch(() => { });
    }
  };

  return (
    <div className="relative w-full h-screen min-h-[600px] overflow-hidden bg-[#1D1B19] font-sans flex items-center justify-center">
      {/* Background Film Roll */}
      {columns.length > 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350vw] sm:w-[300vw] lg:w-[250vw] min-w-[3000px] h-[300vh] sm:h-[250vh] min-h-[2000px] z-0 flex justify-center gap-[clamp(6px,1.5vw,20px)] -rotate-12 pointer-events-none opacity-35">
          {columns.map((col, i) => (
            <FilmColumn
              key={i}
              images={col}
              duration={35 + i * 3}
              reverse={i % 2 === 1}
            />
          ))}
        </div>
      )}

      {/* Overlay: blur nhẹ & gradient dark overlay */}
      <div
        className="absolute inset-0 z-10 transition-opacity duration-700"
        style={{ background: showPopup ? 'linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.5))' : 'transparent' }}
      />

      {/* Content wrapper */}
      {showPopup && (
        <div className="relative z-20 w-[560px] max-w-[calc(100vw-32px)] mx-4 px-2">
          <AnimatePresence mode="wait">
            {view === 'invitation' ? (
              <motion.div
                key="invitation"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-[32px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] p-8 sm:p-10 md:p-12 text-center relative overflow-hidden"
              >
                <motion.div
                  initial={{ opacity: 0, scaleX: 0 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  transition={{ delay: 0.4, duration: 1 }}
                  className="mb-8 flex justify-center origin-center"
                >
                  <div className="w-12 h-[2px] bg-beige rounded-full"></div>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="font-display text-3xl sm:text-4xl font-semibold text-dark mb-6 tracking-tight"
                >
                  BÁO CÁO CÔNG TÁC<br />CHUẨN BỊ CHIẾN DỊCH
                </motion.h1>

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="text-dark/90 text-base md:text-[17px] font-light leading-relaxed text-left space-y-5 px-1 sm:px-2"
                >
                  <p>
                    Kính mời <strong className="font-semibold">Đồng chí mdukiu</strong> tham gia buổi tiệc kỉ niệm 1 năm yêu nhau.<br />
                    <strong className="font-semibold mt-2 block">Kế hoạch tác chiến buổi tối ngày nay như sau:</strong>
                  </p>
                  <ul className="space-y-3 ml-1 border-l-2 border-beige/60 pl-4 py-1 text-left">
                    <li><span className="font-semibold opacity-70 uppercase tracking-widest text-[11px]">Thời gian</span><br />19h00, Ngày 20/05/2025</li>
                    <li><span className="font-semibold opacity-70 uppercase tracking-widest text-[11px]">Địa chỉ</span><br />La Libra Steak House</li>
                    <li><span className="font-semibold opacity-70 uppercase tracking-widest text-[11px]">Về phía bản thân</span><br />
                      Tôi sẽ chủ động xin phép về sớm để thực hiện công tác chuẩn bị hậu cần, rà soát lại tư trang,
                      vũ khí trang bị đảm bảo tác phong chính quy, hiện đại.</li>
                    <li><span className="font-semibold opacity-70 uppercase tracking-widest text-[11px]">Về phía đồng chí</span><br />
                      Mong đồng chí tập trung tối đa, khẩn trương thu xếp thời gian, hoàn thành công tác hậu cần để kịp thời cơ động.</li>
                  </ul>
                  <p className="font-display italic font-semibold text-right text-xl text-beige mt-4">
                    Cảm ơn đồng chí.
                  </p>
                </motion.div>

                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 }}
                  onClick={() => setView('rsvp')}
                  className="mt-8 w-full bg-bluegrey/20 hover:bg-bluegrey/30 border border-bluegrey/30 text-dark rounded-2xl px-5 py-4 font-medium transition-all duration-300 focus:outline-none active:scale-[0.98]"
                >
                  Tiếp tục
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="rsvp"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="bg-white/45 backdrop-blur-[20px] border border-white/30 rounded-[32px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] p-10 md:p-12 text-center relative"
              >
                {isSubmitted ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="py-12 flex flex-col items-center justify-center gap-4"
                  >
                    <div className="w-16 h-16 bg-cream/80 backdrop-blur-md rounded-full flex items-center justify-center mb-2 shadow-sm text-bluegrey">
                      <Heart className="w-8 h-8 fill-current" />
                    </div>
                    <h2 className="font-display text-2xl font-medium text-dark tracking-wide">
                      Love You
                    </h2>
                    <p className="text-dark/70 font-light text-base max-w-[240px]">
                      Hẹ hẹ hẹ
                    </p>
                    <motion.button
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      onClick={handleClosePopup}
                      className="mt-4 bg-bluegrey hover:bg-[#7D9196] text-white rounded-2xl px-6 py-3 font-medium transition-all duration-300 shadow-lg shadow-bluegrey/20 focus:outline-none active:scale-[0.98]"
                    >
                      Đóng
                    </motion.button>
                  </motion.div>
                ) : (
                  <>
                    {/* Decorative Line */}
                    <motion.div
                      initial={{ opacity: 0, scaleX: 0 }}
                      animate={{ opacity: 1, scaleX: 1 }}
                      transition={{ delay: 0.4, duration: 1 }}
                      className="mb-6 flex justify-center origin-center"
                    >
                      <div className="w-12 h-[2px] bg-beige rounded-full mb-2"></div>
                    </motion.div>

                    <motion.h1
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="font-display italic text-4xl sm:text-5xl font-semibold text-dark mb-4 tracking-tight"
                    >
                      1 Year Together
                    </motion.h1>

                    <motion.p
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="text-dark/80 text-base font-light mb-10 leading-relaxed max-w-[320px] mx-auto px-2"
                    >
                      Mời đồng chí xác nhận tham gia buổi hẹn hò. Đố đồng chí bấm được vào KHÔNG THAM GIA LUÔN.
                    </motion.p>

                    <div className="flex flex-col gap-4 mt-8 relative z-20">
                      <motion.button
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        onClick={handleSubmit}
                        className="w-full bg-bluegrey hover:bg-[#7D9196] text-white rounded-2xl px-6 py-4 font-medium transition-all duration-300 shadow-lg shadow-bluegrey/20 focus:outline-none active:scale-[0.98]"
                      >
                        Xác nhận tham gia
                      </motion.button>

                      <motion.button
                        ref={noBtnRef}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, x: noPosition.x, y: noPosition.y }}
                        transition={{
                          delay: 0.6,
                          x: { type: "spring", stiffness: 200, damping: 15 },
                          y: { type: "spring", stiffness: 200, damping: 15 }
                        }}
                        onHoverStart={handleNoHover}
                        onClick={handleNoHover}
                        className="w-full bg-white/40 border border-white/30 text-dark/70 hover:text-dark rounded-2xl px-6 py-4 font-medium backdrop-blur-sm transition-colors duration-300 focus:outline-none"
                        style={{ zIndex: 10 }}
                      >
                        Không tham gia
                      </motion.button>
                    </div>

                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.8 }}
                      className="mt-10 pt-8 border-t border-white/20"
                    >
                      <p className="font-display italic text-beige text-lg font-semibold">
                        From liemqhuy with love.
                      </p>
                    </motion.div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Audio player */}
      <audio ref={audioRef} src="/dont-break-my-heart.mp3" loop />

      {/* Corner Detail */}
      <div className="absolute bottom-8 left-8 z-10 hidden sm:flex flex-col">
        <span className="text-white/40 text-[10px] tracking-[0.3em] uppercase">Est. May 2025</span>
        <div className="w-12 h-[1px] bg-white/20 mt-2"></div>
      </div>
    </div>
  );
}
