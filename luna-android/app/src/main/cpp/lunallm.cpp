#include <jni.h>
#include <android/log.h>
#include <atomic>
#include <chrono>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>
#include "llama.h"

#define TAG "LunaLLM"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, TAG, __VA_ARGS__)

struct LunaModel {
    llama_model * model = nullptr;
    llama_context * ctx = nullptr;
    const llama_vocab * vocab = nullptr;
    std::atomic<bool> stop{false};
    std::mutex mu;
    int n_ctx = 2048;
    int n_batch = 128;
};

static std::string jstr(JNIEnv * env, jstring s) {
    if (!s) return {};
    const char * c = env->GetStringUTFChars(s, nullptr);
    std::string out = c ? c : "";
    if (c) env->ReleaseStringUTFChars(s, c);
    return out;
}

static std::string esc(const std::string & s) {
    std::string o;
    for (char c : s) {
        if (c == '"' || c == '\\') o += '\\';
        if ((unsigned char)c >= 0x20) o += c;
    }
    return o;
}

static bool utf8_complete(const std::string & s) {
    size_t i = 0;
    while (i < s.size()) {
        unsigned char c = s[i];
        int need;
        if (c < 0x80) { i++; continue; }
        else if ((c & 0xE0) == 0xC0) need = 2;
        else if ((c & 0xF0) == 0xE0) need = 3;
        else if ((c & 0xF8) == 0xF0) need = 4;
        else return false;
        if (i + need > s.size()) return false;
        i += need;
    }
    return true;
}

extern "C" JNIEXPORT jlong JNICALL
Java_com_tapazaki_lunatz_LlamaEngine_nativeLoad(JNIEnv * env, jclass, jstring jpath, jint nCtx, jint nThreads, jint nBatch) {
    std::string path = jstr(env, jpath);
    auto * h = new LunaModel();
    h->n_ctx = nCtx > 0 ? nCtx : 2048;
    h->n_batch = nBatch > 0 ? nBatch : 128;
    llama_model_params mp = llama_model_default_params();
    mp.n_gpu_layers = 0;
    mp.load_mode = LLAMA_LOAD_MODE_MMAP;
    h->model = llama_model_load_from_file(path.c_str(), mp);
    if (!h->model) { delete h; return 0; }
    h->vocab = llama_model_get_vocab(h->model);
    llama_context_params cp = llama_context_default_params();
    cp.n_ctx = h->n_ctx;
    cp.n_batch = h->n_batch;
    cp.n_ubatch = h->n_batch;
    cp.n_threads = nThreads > 0 ? nThreads : 4;
    cp.n_threads_batch = cp.n_threads;
    cp.embeddings = false;
    cp.offload_kqv = false;
    h->ctx = llama_init_from_model(h->model, cp);
    if (!h->ctx) { llama_model_free(h->model); delete h; return 0; }
    LOGI("model loaded ctx=%d batch=%d threads=%d", h->n_ctx, h->n_batch, cp.n_threads);
    return reinterpret_cast<jlong>(h);
}

extern "C" JNIEXPORT void JNICALL
Java_com_tapazaki_lunatz_LlamaEngine_nativeUnload(JNIEnv *, jclass, jlong ptr) {
    auto * h = reinterpret_cast<LunaModel *>(ptr);
    if (!h) return;
    h->stop = true;
    std::lock_guard<std::mutex> lk(h->mu);
    if (h->ctx) llama_free(h->ctx);
    if (h->model) llama_model_free(h->model);
    delete h;
}

extern "C" JNIEXPORT void JNICALL
Java_com_tapazaki_lunatz_LlamaEngine_nativeStop(JNIEnv *, jclass, jlong ptr) {
    auto * h = reinterpret_cast<LunaModel *>(ptr);
    if (h) h->stop = true;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_tapazaki_lunatz_LlamaEngine_nativeInfo(JNIEnv * env, jclass, jlong ptr) {
    auto * h = reinterpret_cast<LunaModel *>(ptr);
    if (!h || !h->model) return env->NewStringUTF("{}");
    char buf[512];
    llama_model_desc(h->model, buf, sizeof(buf));
    std::string desc = buf;
    const char * tmpl = llama_model_chat_template(h->model, nullptr);
    char arch[128] = {0};
    llama_model_meta_val_str(h->model, "general.architecture", arch, sizeof(arch));
    char name[256] = {0};
    llama_model_meta_val_str(h->model, "general.name", name, sizeof(name));
    std::string json = "{\"desc\":\"" + esc(desc) + "\",\"arch\":\"" + esc(arch) + "\",\"name\":\"" + esc(name) +
        "\",\"ctxTrain\":" + std::to_string(llama_model_n_ctx_train(h->model)) +
        ",\"params\":" + std::to_string(llama_model_n_params(h->model)) +
        ",\"size\":" + std::to_string(llama_model_size(h->model)) +
        ",\"hasTemplate\":" + (tmpl ? "true" : "false") + "}";
    return env->NewStringUTF(json.c_str());
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_tapazaki_lunatz_LlamaEngine_nativeMeta(JNIEnv * env, jclass, jstring jpath) {
    std::string path = jstr(env, jpath);
    llama_model_params mp = llama_model_default_params();
    mp.vocab_only = true;
    mp.load_mode = LLAMA_LOAD_MODE_MMAP;
    llama_model * m = llama_model_load_from_file(path.c_str(), mp);
    if (!m) return env->NewStringUTF("{\"ok\":false}");
    char desc[256]={0}, arch[128]={0}, name[256]={0};
    llama_model_desc(m, desc, sizeof(desc));
    llama_model_meta_val_str(m, "general.architecture", arch, sizeof(arch));
    llama_model_meta_val_str(m, "general.name", name, sizeof(name));
    std::string json = std::string("{\"ok\":true,\"desc\":\"") + esc(desc) + "\",\"arch\":\"" + esc(arch) + "\",\"name\":\"" + esc(name) +
        "\",\"ctxTrain\":" + std::to_string(llama_model_n_ctx_train(m)) +
        ",\"params\":" + std::to_string(llama_model_n_params(m)) + "}";
    llama_model_free(m);
    return env->NewStringUTF(json.c_str());
}

extern "C" JNIEXPORT jint JNICALL
Java_com_tapazaki_lunatz_LlamaEngine_nativeGenerate(JNIEnv * env, jclass, jlong ptr,
        jobjectArray roles, jobjectArray contents, jint maxTokens, jfloat temp, jfloat topP, jobject callback) {
    auto * h = reinterpret_cast<LunaModel *>(ptr);
    if (!h || !h->ctx) return -1;
    std::lock_guard<std::mutex> lk(h->mu);
    h->stop = false;
    jclass cbCls = env->GetObjectClass(callback);
    jmethodID onToken = env->GetMethodID(cbCls, "onToken", "(Ljava/lang/String;)V");
    jmethodID onDone = env->GetMethodID(cbCls, "onDone", "(IJ)V");
    jmethodID onError = env->GetMethodID(cbCls, "onError", "(Ljava/lang/String;)V");
    auto fail = [&](const char * msg) {
        jstring s = env->NewStringUTF(msg);
        env->CallVoidMethod(callback, onError, s);
        env->DeleteLocalRef(s);
        return -2;
    };
    jsize n = env->GetArrayLength(roles);
    if (n != env->GetArrayLength(contents) || n <= 0) return fail("mensagens inválidas");
    std::vector<std::string> rs, cs;
    std::vector<llama_chat_message> msgs;
    for (jsize i = 0; i < n; i++) {
        rs.push_back(jstr(env, (jstring)env->GetObjectArrayElement(roles, i)));
        cs.push_back(jstr(env, (jstring)env->GetObjectArrayElement(contents, i)));
        msgs.push_back({rs.back().c_str(), cs.back().c_str()});
    }
    const char * tmpl = llama_model_chat_template(h->model, nullptr);
    std::string prompt;
    int need = llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), true, nullptr, 0);
    if (need > 0) {
        prompt.resize(need + 1);
        llama_chat_apply_template(tmpl, msgs.data(), msgs.size(), true, prompt.data(), prompt.size());
        prompt.resize(need);
    } else {
        for (size_t i = 0; i < msgs.size(); i++) {
            prompt += msgs[i].role;
            prompt += ": ";
            prompt += msgs[i].content;
            prompt += "\n";
        }
        prompt += "assistant: ";
    }
    std::vector<llama_token> tokens(prompt.size() + 32);
    int ntok = llama_tokenize(h->vocab, prompt.c_str(), prompt.size(), tokens.data(), tokens.size(), true, true);
    if (ntok < 0) return fail("prompt longo demais");
    tokens.resize(ntok);
    if (ntok >= h->n_ctx - 8) return fail("contexto insuficiente; reduza o histórico");
    llama_memory_clear(llama_get_memory(h->ctx), true);

    llama_batch batch = llama_batch_init(h->n_batch, 0, 1);
    int pos = 0;
    bool ok = true;
    while (pos < ntok) {
        int count = std::min(h->n_batch, ntok - pos);
        batch.n_tokens = count;
        for (int i = 0; i < count; i++) {
            batch.token[i] = tokens[pos + i];
            batch.pos[i] = pos + i;
            batch.n_seq_id[i] = 1;
            batch.seq_id[i][0] = 0;
            batch.logits[i] = (pos + i == ntok - 1) ? 1 : 0;
        }
        if (llama_decode(h->ctx, batch) != 0) { ok = false; break; }
        pos += count;
    }
    if (!ok) { llama_batch_free(batch); return fail("falha ao processar prompt"); }

    llama_sampler * smpl = llama_sampler_chain_init(llama_sampler_chain_default_params());
    llama_sampler_chain_add(smpl, llama_sampler_init_top_k(40));
    llama_sampler_chain_add(smpl, llama_sampler_init_top_p(topP > 0 ? topP : 0.9f, 1));
    llama_sampler_chain_add(smpl, llama_sampler_init_temp(temp > 0 ? temp : 0.8f));
    llama_sampler_chain_add(smpl, llama_sampler_init_penalties(llama_vocab_n_tokens(h->vocab), 64, 1.1f, 0.0f, 0.0f));
    llama_sampler_chain_add(smpl, llama_sampler_init_dist(1234));
    auto start = std::chrono::steady_clock::now();
    int generated = 0;
    std::string pending;
    int limit = maxTokens > 0 ? maxTokens : 256;
    while (generated < limit && !h->stop && pos < h->n_ctx - 1) {
        llama_token id = llama_sampler_sample(smpl, h->ctx, -1);
        llama_sampler_accept(smpl, id);
        if (llama_vocab_is_eog(h->vocab, id)) break;
        char piece[256];
        int pn = llama_token_to_piece(h->vocab, id, piece, sizeof(piece), 0, false);
        if (pn > 0) {
            pending.append(piece, pn);
            if (utf8_complete(pending)) {
                jstring s = env->NewStringUTF(pending.c_str());
                env->CallVoidMethod(callback, onToken, s);
                env->DeleteLocalRef(s);
                pending.clear();
                if (env->ExceptionCheck()) { env->ExceptionClear(); h->stop = true; break; }
            }
        }
        generated++;
        batch.n_tokens = 1;
        batch.token[0] = id;
        batch.pos[0] = pos++;
        batch.n_seq_id[0] = 1;
        batch.seq_id[0][0] = 0;
        batch.logits[0] = 1;
        if (llama_decode(h->ctx, batch) != 0) break;
    }
    if (!pending.empty()) {
        jstring s = env->NewStringUTF(pending.c_str());
        env->CallVoidMethod(callback, onToken, s);
        env->DeleteLocalRef(s);
    }
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start).count();
    llama_sampler_free(smpl);
    llama_batch_free(batch);
    env->CallVoidMethod(callback, onDone, generated, (jlong)ms);
    return generated;
}

extern "C" JNIEXPORT jint JNICALL
Java_com_tapazaki_lunatz_LlamaEngine_nativeApiVersion(JNIEnv *, jclass) {
    return 1;
}
