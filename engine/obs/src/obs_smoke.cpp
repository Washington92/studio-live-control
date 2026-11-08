#include <obs.h>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
  const bool initialize_scene = argc == 2 && std::string(argv[1]) == "--scene";
  const bool initialize_av = initialize_scene || (argc == 2 && std::string(argv[1]) == "--av");
  if (argc > 1 && !initialize_av) {
    std::cerr << "Uso: wmix-obs-smoke [--av | --scene]\n";
    return 2;
  }

  if (!obs_startup("pt-BR", nullptr, nullptr)) {
    std::cerr << "WMix: falha ao iniciar libobs.\n";
    return 1;
  }

  int result = 0;
  if (initialize_av) {
    obs_video_info video{};
    video.graphics_module = "libobs-d3d11.dll";
    video.fps_num = 30;
    video.fps_den = 1;
    video.base_width = 1280;
    video.base_height = 720;
    video.output_width = 1280;
    video.output_height = 720;
    video.output_format = VIDEO_FORMAT_NV12;
    video.colorspace = VIDEO_CS_709;
    video.range = VIDEO_RANGE_PARTIAL;
    video.scale_type = OBS_SCALE_BICUBIC;
    video.gpu_conversion = true;

    const int video_result = obs_reset_video(&video);
    if (video_result != OBS_VIDEO_SUCCESS) {
      std::cerr << "WMix: falha ao inicializar video (codigo "
                << video_result << "). Verifique DLLs e GPU.\n";
      result = 1;
    } else {
      obs_audio_info audio{};
      audio.samples_per_sec = 48000;
      audio.speakers = SPEAKERS_STEREO;
      if (!obs_reset_audio(&audio)) {
        std::cerr << "WMix: falha ao inicializar audio.\n";
        result = 1;
      } else {
        std::cout << "WMix: libobs video 1280x720@30 e audio 48kHz inicializados.\n";
        if (initialize_scene) {
          obs_scene_t* scene = obs_scene_create("WMix Program");
          if (!scene) {
            std::cerr << "WMix: falha ao criar cena Program.\\n";
            result = 1;
          } else {
            obs_source_t* source = obs_scene_get_source(scene);
            obs_set_output_source(0, source);
            std::cout << "WMix: cena Program vinculada ao canal 0.\\n";
            obs_set_output_source(0, nullptr);
            obs_scene_release(scene);
          }
        }
      }
    }
  } else {
    std::cout << "WMix: libobs inicializado. Use --av para testar video e audio.\n";
  }

  obs_shutdown();
  return result;
}
