import React from "react";

function ResponsiveImage({
  src,
  alt,
  width,
  height,
  className,
  style,
  loading = "lazy" as "lazy" | "eager",
  sizes,
  ...props
}: {
  src: any;
  alt: any;
  width?: any;
  height?: any;
  className?: any;
  style?: any;
  loading?: "lazy" | "eager";
  sizes?: any;
  [key: string]: any;
}) {
  // Extract filename and extension
  const getImageVariants = (imagePath: any) => {
    if (!imagePath) return { webp: null, fallback: imagePath };

    const lastDot = imagePath.lastIndexOf(".");
    const lastSlash = imagePath.lastIndexOf("/");

    if (lastDot === -1 || lastDot < lastSlash) {
      return { webp: null, fallback: imagePath };
    }

    const basePath = imagePath.substring(0, lastDot);

    // Check if this is an employee photo or logo
    const isEmployeePhoto = imagePath.includes("employee_photo");
    const isLogo = imagePath.includes("logo");

    if (isEmployeePhoto) {
      // Use thumb variant for small displays
      return {
        webp: `${basePath}-thumb.webp`,
        webp2x: `${basePath}-thumb@2x.webp`,
        fallback: `${basePath}-thumb.jpg`,
        fallback2x: `${basePath}-thumb@2x.jpg`,
      };
    }

    if (isLogo) {
      return {
        webp: `${basePath}-small.webp`,
        webpLarge: `${basePath}.webp`,
        fallback: `${basePath}-small.png`,
        fallbackLarge: `${basePath}.png`,
      };
    }

    return {
      webp: `${basePath}.webp`,
      fallback: imagePath,
    };
  };

  const variants = getImageVariants(src);

  // Build srcset for responsive images
  const buildSrcSet = () => {
    if (variants.webp2x && variants.fallback2x) {
      return {
        webpSrcSet: `${variants.webp} 1x, ${variants.webp2x} 2x`,
        fallbackSrcSet: `${variants.fallback} 1x, ${variants.fallback2x} 2x`,
      };
    }

    if (variants.webpLarge && variants.fallbackLarge) {
      return {
        webpSrcSet: `${variants.webp} 320w, ${variants.webpLarge} 500w`,
        fallbackSrcSet: `${variants.fallback} 320w, ${variants.fallbackLarge} 500w`,
      };
    }

    return {
      webpSrcSet: variants.webp,
      fallbackSrcSet: variants.fallback,
    };
  };

  const srcSets = buildSrcSet();

  return (
    <picture>
      {/* WebP source */}
      {variants.webp && (
        <source
          type="image/webp"
          srcSet={srcSets.webpSrcSet ?? undefined}
          sizes={sizes}
        />
      )}

      {/* Fallback image */}
      <img
        src={variants.fallback || src}
        srcSet={srcSets.fallbackSrcSet}
        alt={alt}
        width={width}
        height={height}
        loading={loading}
        decoding="async"
        className={className}
        style={style}
        {...props}
      />
    </picture>
  );
}

export default React.memo(ResponsiveImage);
