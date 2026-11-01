package com.tapazaki.lunatz;

public final class LlamaEngine {
    public interface Callback {
        void onToken(String token);
        void onDone(int tokens, long millis);
        void onError(String error);
    }
    private static final boolean AVAILABLE;
    static {
        boolean ok;
        try { System.loadLibrary("lunallm"); ok = true; }
        catch (Throwable t) { ok = false; }
        AVAILABLE = ok;
    }
    public static boolean available() { return AVAILABLE; }
    public static native long nativeLoad(String path, int nCtx, int nThreads, int nBatch);
    public static native void nativeUnload(long handle);
    public static native void nativeStop(long handle);
    public static native String nativeInfo(long handle);
    public static native String nativeMeta(String path);
    public static native int nativeGenerate(long handle, String[] roles, String[] contents, int maxTokens, float temp, float topP, Callback callback);
    public static native int nativeApiVersion();
}
