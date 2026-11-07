#include <obs.h>
#include <iostream>

int main() {
  // Initialization validates libobs linkage and runtime dependencies.
  // No production output or camera capture is claimed by this smoke test.
  if (!obs_startup("pt-BR", nullptr, nullptr)) {
    std::cerr << "Falha ao iniciar libobs. Verifique runtime e dependencias.\n";
    return 1;
  }
  const obs_video_info video{
    .graphics_module = nullptr
  };
  (void)video;
  std::cout << "WMix: libobs inicializado com sucesso.\n";
  obs_shutdown();
  return 0;
}
