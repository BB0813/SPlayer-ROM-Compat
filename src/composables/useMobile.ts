import { useBreakpoints, breakpointsTailwind } from "@vueuse/core";

export const useMobile = () => {
  const breakpoints = useBreakpoints(breakpointsTailwind);

  const isSmall = useMediaQuery("(max-width: 511.98px)");
  const isMobile = breakpoints.smaller("sm");
  const isSmallScreen = breakpoints.smaller("md");
  const isTablet = useMediaQuery("(max-width: 989.98px)");
  const isDesktop = breakpoints.greaterOrEqual("lg");
  const isLargeDesktop = breakpoints.greaterOrEqual("xl");

  return {
    isSmall,
    isMobile,
    isSmallScreen,
    isTablet,
    isDesktop,
    isLargeDesktop,
    breakpoints,
  };
};
