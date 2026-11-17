# The Zoom and Vonage bridges of the 24Therapy kit compile against those SDKs (compileOnly);
# this build does not bundle them, so R8 must not fail on their missing classes.
-dontwarn us.zoom.**
-dontwarn com.opentok.**
-dontwarn com.vonage.**
