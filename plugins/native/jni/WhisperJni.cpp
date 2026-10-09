/**
 * WhisperJni.cpp — bridge JNI entre WhisperCppSTT.kt e a API C do whisper.cpp.
 *
 * Nomes das funções seguem a convenção Java JNI:
 *   Java_<pacote>_<classe>_<método>
 * onde '.' vira '_' e o pacote é com_masya_argos_modules.
 *
 * Compilado como parte de libwhisper-jni.so via CMakeLists.txt.
 */
#include <jni.h>
#include <string>
#include <android/log.h>
#include "whisper.h"

#define LOG_TAG "WhisperJni"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO,  LOG_TAG, __VA_ARGS__)
#define LOGW(...) __android_log_print(ANDROID_LOG_WARN,  LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" {

/**
 * Inicializa o contexto whisper.cpp a partir do arquivo de modelo GGML.
 * Retorna o ponteiro convertido para jlong (0 em caso de falha).
 */
JNIEXPORT jlong JNICALL
Java_com_masya_argos_modules_WhisperCppSTT_nativeInit(
        JNIEnv *env, jobject /*thiz*/, jstring modelPath) {

    const char *path = env->GetStringUTFChars(modelPath, nullptr);
    LOGI("Carregando modelo de: %s", path);

    whisper_context_params cparams = whisper_context_default_params();
    cparams.use_gpu = false; // Android não tem suporte GPU no whisper.cpp ainda

    whisper_context *ctx = whisper_init_from_file_with_params(path, cparams);
    env->ReleaseStringUTFChars(modelPath, path);

    if (!ctx) {
        LOGE("whisper_init_from_file_with_params retornou NULL");
        return 0L;
    }
    LOGI("Contexto Whisper inicializado OK");
    return reinterpret_cast<jlong>(ctx);
}

/**
 * Transcreve amostras PCM Float32 16kHz mono.
 * Retorna a transcrição concatenada de todos os segmentos.
 */
JNIEXPORT jstring JNICALL
Java_com_masya_argos_modules_WhisperCppSTT_nativeTranscribe(
        JNIEnv *env, jobject /*thiz*/, jlong handle,
        jfloatArray pcmFloat, jstring language) {

    auto *ctx = reinterpret_cast<whisper_context *>(handle);
    if (!ctx) {
        LOGE("nativeTranscribe: handle inválido");
        return env->NewStringUTF("");
    }

    const char *lang = env->GetStringUTFChars(language, nullptr);

    // Parâmetros otimizados para português, baixa latência em CPU
    whisper_full_params params = whisper_full_default_params(WHISPER_SAMPLING_GREEDY);
    params.language          = lang;
    params.translate         = false;
    params.no_context        = true;   // sem histórico entre chamadas
    params.single_segment    = false;
    params.print_progress    = false;
    params.print_realtime    = false;
    params.print_timestamps  = false;
    params.suppress_blank    = true;
    params.token_timestamps  = false;
    params.n_threads         = 4;      // ajustável: 4 threads são suficientes pra tiny/base
    params.offset_ms         = 0;
    params.duration_ms       = 0;      // sem limite de duração

    jfloat *samples  = env->GetFloatArrayElements(pcmFloat, nullptr);
    jsize   n_samples = env->GetArrayLength(pcmFloat);

    LOGI("Transcrevendo %d amostras (~%d ms)", n_samples, n_samples / 16);

    int rc = whisper_full(ctx, params, samples, (int)n_samples);

    env->ReleaseFloatArrayElements(pcmFloat, samples, JNI_ABORT);
    env->ReleaseStringUTFChars(language, lang);

    if (rc != 0) {
        LOGE("whisper_full retornou %d", rc);
        return env->NewStringUTF("");
    }

    int n_segments = whisper_full_n_segments(ctx);
    LOGI("%d segmentos detectados", n_segments);

    std::string result;
    result.reserve(256);
    for (int i = 0; i < n_segments; i++) {
        const char *seg_text = whisper_full_get_segment_text(ctx, i);
        if (seg_text) result += seg_text;
    }

    return env->NewStringUTF(result.c_str());
}

/**
 * Libera o contexto whisper.cpp e a memória do modelo.
 */
JNIEXPORT void JNICALL
Java_com_masya_argos_modules_WhisperCppSTT_nativeFree(
        JNIEnv * /*env*/, jobject /*thiz*/, jlong handle) {

    auto *ctx = reinterpret_cast<whisper_context *>(handle);
    if (ctx) {
        whisper_free(ctx);
        LOGI("Contexto Whisper liberado");
    }
}

} // extern "C"
