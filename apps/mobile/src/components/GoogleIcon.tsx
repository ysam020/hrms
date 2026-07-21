import Svg, { Path } from "react-native-svg";

// Same paths as apps/web/src/features/auth/LoginPage.tsx's inline Google "G" mark.
export default function GoogleIcon({ size = 18 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M47.5 24.6c0-1.6-.1-3.1-.4-4.6H24v8.7h13.2c-.6 3-2.3 5.5-4.8 7.2v6h7.8c4.6-4.2 7.3-10.5 7.3-17.3z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.5 0 12-2.1 16-5.8l-7.8-6c-2.2 1.5-5 2.3-8.2 2.3-6.3 0-11.6-4.2-13.5-10H2.5v6.2C6.5 42.6 14.7 48 24 48z"
      />
      <Path
        fill="#FBBC05"
        d="M10.5 28.5c-.5-1.5-.8-3.1-.8-4.8s.3-3.3.8-4.8v-6.2H2.5A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l8-6.2z"
      />
      <Path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.7 1.2 9.2 3.6l6.9-6.9C35.9 2.4 30.4 0 24 0 14.7 0 6.5 5.4 2.5 13.3l8 6.2C12.4 13.7 17.7 9.5 24 9.5z"
      />
    </Svg>
  );
}
