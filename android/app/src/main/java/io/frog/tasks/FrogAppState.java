package io.frog.tasks;

public final class FrogAppState {
    private static volatile boolean inForeground = false;

    private FrogAppState() {}

    public static void setInForeground(boolean value) {
        inForeground = value;
    }

    public static boolean isInForeground() {
        return inForeground;
    }
}
