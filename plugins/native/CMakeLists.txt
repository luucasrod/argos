cmake_minimum_required(VERSION 3.22.1)
project("whisper-jni" LANGUAGES C CXX)

# whisper.cpp via FetchContent — baixado em tempo de build pelo CMake.
# Requer conexão com internet durante o primeiro `gradlew assembleDebug`.
include(FetchContent)

FetchContent_Declare(
    whisper_cpp
    GIT_REPOSITORY https://github.com/ggerganov/whisper.cpp.git
    GIT_TAG        v1.7.5
    GIT_SHALLOW    TRUE
    GIT_PROGRESS   FALSE
)

# Desabilita partes do whisper.cpp que não precisamos no Android
set(WHISPER_BUILD_TESTS    OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(WHISPER_BUILD_SERVER   OFF CACHE BOOL "" FORCE)
set(GGML_METAL             OFF CACHE BOOL "" FORCE)  # sem Metal no Android
set(GGML_CUDA              OFF CACHE BOOL "" FORCE)  # sem CUDA no Android
set(GGML_OPENMP            ON  CACHE BOOL "" FORCE)  # OpenMP melhora latência

FetchContent_MakeAvailable(whisper_cpp)

# Nossa shared library JNI que wraps whisper.cpp
add_library(whisper-jni SHARED
    ${CMAKE_SOURCE_DIR}/jni/WhisperJni.cpp
)

target_include_directories(whisper-jni PRIVATE
    ${whisper_cpp_SOURCE_DIR}/include
    ${whisper_cpp_SOURCE_DIR}/ggml/include
)

target_link_libraries(whisper-jni
    whisper      # target criado pelo FetchContent do whisper.cpp
    log          # Android logging
)

# Otimizações para ARM64 — melhora a latência no tiny/base
if(ANDROID_ABI STREQUAL "arm64-v8a")
    target_compile_options(whisper-jni PRIVATE -O3 -march=armv8-a+fp16)
    target_compile_options(whisper PRIVATE -O3 -march=armv8-a+fp16)
endif()
