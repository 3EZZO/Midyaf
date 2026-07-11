import { useCallback, useRef } from "react";

interface TiltOptions {
  maxRotation?: number; // max tilt in degrees (default: 8)
  scale?: number; // hover scale (default: 1.015)
  perspective?: number; // 3D depth (default: 1000px)
}

export function use3DTilt<T extends HTMLElement>({
  maxRotation = 8,
  scale = 1.015,
  perspective = 1000
}: TiltOptions = {}) {
  const ref = useRef<T>(null);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<T>) => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -maxRotation;
      const rotateY = ((x - centerX) / centerX) * maxRotation;

      ref.current.style.transform = `perspective(${perspective}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) scale3d(${scale}, ${scale}, 1)`;
    },
    [maxRotation, scale, perspective]
  );

  const handleMouseLeave = useCallback(() => {
    if (!ref.current) return;
    ref.current.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
  }, [perspective]);

  return { ref, handleMouseMove, handleMouseLeave };
}
