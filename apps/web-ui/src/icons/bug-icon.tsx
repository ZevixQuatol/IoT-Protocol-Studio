import { forwardRef, useImperativeHandle } from "react";
import { motion, useAnimate } from "motion/react";
import type { AnimatedIconHandle, AnimatedIconProps } from "./types";

const BugIcon = forwardRef<AnimatedIconHandle, AnimatedIconProps>(
  ({ size = 24, className = "", strokeWidth = 2, color = "currentColor" }, ref) => {
    const [scope, animate] = useAnimate();

    const start = async () => {
      animate(
        ".bug-leg-left",
        { x: [-1, 1, -1], rotate: [-5, 5, -5] },
        { duration: 0.2, repeat: 2, ease: "easeInOut" },
      );
      animate(
        ".bug-leg-right",
        { x: [1, -1, 1], rotate: [5, -5, 5] },
        { duration: 0.2, repeat: 2, ease: "easeInOut" },
      );
      animate(
        ".bug-body",
        { x: [-0.5, 0.5, -0.5] },
        { duration: 0.1, repeat: 2, ease: "easeInOut" },
      );
    };

    const stop = async () => {
      animate(
        ".bug-leg-left, .bug-leg-right, .bug-body",
        { x: 0, rotate: 0 },
        { duration: 0.2, ease: "easeOut" },
      );
    };

    useImperativeHandle(ref, () => ({ startAnimation: start, stopAnimation: stop }));

    return (
      <motion.svg
        ref={scope}
        aria-hidden="true"
        className={`bug-icon ${className}`}
        color={color}
        fill="none"
        height={size}
        onHoverEnd={stop}
        onHoverStart={start}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        viewBox="0 0 24 24"
        width={size}
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M0 0h24v24H0z" fill="none" stroke="none" />
        <path d="M9 9v-1a3 3 0 0 1 6 0v1" />
        <motion.path
          className="bug-body"
          d="M8 9h8a6 6 0 0 1 1 3v3a5 5 0 0 1 -10 0v-3a6 6 0 0 1 1 -3"
        />
        <motion.path className="bug-leg-left" d="M3 13h4" />
        <motion.path className="bug-leg-left" d="m4 19 3.35-2" />
        <motion.path className="bug-leg-left" d="M4 7 7.75 9.4" />
        <motion.path className="bug-leg-right" d="M17 13h4" />
        <motion.path className="bug-leg-right" d="m20 19-3.35-2" />
        <motion.path className="bug-leg-right" d="m20 7-3.75 2.4" />
        <path d="M12 20v-6" />
      </motion.svg>
    );
  },
);

BugIcon.displayName = "BugIcon";

export default BugIcon;
