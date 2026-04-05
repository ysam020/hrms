import type { CSSProperties } from "react";
function LogoLight({ style }: { style?: CSSProperties } = {}) {
  return (
    <div style={style}>
      <svg viewBox="0 0 500 140" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id="glow">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>

          {/* <style>
            @import
            url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600&display=swap');
          </style> */}
        </defs>

        <circle cx="85" cy="55" r="35" fill="url(#glow)" opacity="0.3">
          <animate
            attributeName="opacity"
            values="0.2;0.4;0.2"
            dur="3s"
            repeatCount="indefinite"
          />
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 85 55"
            to="360 85 55"
            dur="8s"
            repeatCount="indefinite"
          />
        </circle>

        <path
          d="M 55 25 L 75 45 L 55 65"
          stroke="#FF6B35"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0"
        >
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.5s"
            begin="0s"
            fill="freeze"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            from="-20,0"
            to="0,0"
            dur="0.5s"
            begin="0s"
            fill="freeze"
          />
        </path>

        <path
          d="M 75 45 L 95 25 L 115 45"
          stroke="#00BFA5"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0"
        >
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.5s"
            begin="0.3s"
            fill="freeze"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            from="0,-20"
            to="0,0"
            dur="0.5s"
            begin="0.3s"
            fill="freeze"
          />
        </path>

        <path
          d="M 115 45 L 95 65 L 115 85"
          stroke="#4CAF50"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0"
        >
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.5s"
            begin="0.6s"
            fill="freeze"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            from="20,0"
            to="0,0"
            dur="0.5s"
            begin="0.6s"
            fill="freeze"
          />
        </path>

        <path
          d="M 55 65 L 75 85 L 95 65"
          stroke="#E53935"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity="0"
        >
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.5s"
            begin="0.9s"
            fill="freeze"
          />
          <animateTransform
            attributeName="transform"
            type="translate"
            from="0,20"
            to="0,0"
            dur="0.5s"
            begin="0.9s"
            fill="freeze"
          />
        </path>

        <g opacity="0">
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.8s"
            begin="1.2s"
            fill="freeze"
          />
          <text
            x="162"
            y="75"
            fontFamily="'Poppins', Arial, sans-serif"
            fontSize="52"
            fontWeight="600"
            fill="#FFFFFF"
            stroke="#E0E0E0"
            strokeWidth="1"
            letterSpacing="2"
          >
            PRAESTO
          </text>
        </g>

        <g opacity="0">
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.6s"
            begin="1.8s"
            fill="freeze"
          />
          <text
            x="162"
            y="102"
            fontFamily="'Poppins', Arial, sans-serif"
            fontSize="13"
            fontWeight="300"
            fill="#E8E8E8"
            letterSpacing="3.5"
          >
            HUMAN RESOURCE MANAGEMENT
          </text>
          <text
            x="162"
            y="120"
            fontFamily="'Poppins', Arial, sans-serif"
            fontSize="13"
            fontWeight="300"
            fill="#E8E8E8"
            letterSpacing="3.5"
          >
            SYSTEM
          </text>
        </g>
      </svg>
    </div>
  );
}

export default LogoLight;
