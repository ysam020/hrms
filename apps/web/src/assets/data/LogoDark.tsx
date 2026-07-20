import type { CSSProperties } from "react";

function LogoDark({ style }: { style?: CSSProperties } = {}) {
  return (
    <div style={style}>
      <svg viewBox="0 0 500 140" xmlns="http://www.w3.org/2000/svg">
        {/* Logo mark */}
        <g transform="translate(-4,-4) scale(1.12)">
          <path
            d="M 63.5,81.4 L 64.5,34.7 L 72.1,44.3"
            stroke="#fd7624"
            strokeWidth="5.3"
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
              from="-15,10"
              to="0,0"
              dur="0.5s"
              begin="0s"
              fill="freeze"
            />
          </path>

          <path
            d="M 75.5,57.0
               L 102.7,27.5
               L 102.7,72.0
               L 95.7,65.0"
            stroke="#25b37b"
            strokeWidth="5.3"
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
              from="15,-15"
              to="0,0"
              dur="0.5s"
              begin="0.3s"
              fill="freeze"
            />
          </path>

          <path
            d="M 63.3,82.2 L 91.3,57.2"
            stroke="#f03933"
            strokeWidth="5.3"
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
              from="-15,15"
              to="0,0"
              dur="0.5s"
              begin="0.6s"
              fill="freeze"
            />
          </path>
        </g>

        {/* PRAESTO */}
        <g opacity="0">
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.8s"
            begin="1.0s"
            fill="freeze"
          />
          <text
            x="128"
            y="75"
            fontFamily="'Poppins', Arial, sans-serif"
            fontSize="52"
            fontWeight="600"
            fill="#2C2C2C"
            letterSpacing="2"
          >
            PRAESTO
          </text>
        </g>

        {/* Subtitle */}
        <g opacity="0">
          <animate
            attributeName="opacity"
            from="0"
            to="1"
            dur="0.6s"
            begin="1.6s"
            fill="freeze"
          />
          <text
            x="128"
            y="102"
            fontFamily="'Poppins', Arial, sans-serif"
            fontSize="13"
            fontWeight="400"
            fill="#5A5A5A"
            letterSpacing="3.5"
          >
            HUMAN RESOURCE MANAGEMENT
          </text>
          <text
            x="128"
            y="120"
            fontFamily="'Poppins', Arial, sans-serif"
            fontSize="13"
            fontWeight="400"
            fill="#5A5A5A"
            letterSpacing="3.5"
          >
            SYSTEM
          </text>
        </g>
      </svg>
    </div>
  );
}

export default LogoDark;
