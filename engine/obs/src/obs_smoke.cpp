#include <obs.h>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
  const bool initialize_scene = argc == 2 && std::string(argv[1]) == "--scene";
  const bool initialize_control = argc == 2 && std::string(argv[1]) == "--control";
  const bool initialize_switch = argc == 2 && std::string(argv[1]) == "--switch";
  const bool initialize_dual = argc == 2 && std::string(argv[1]) == "--dual";
  const bool initialize_av = initialize_scene || initialize_dual || initialize_switch || initialize_control || (argc == 2 && std::string(argv[1]) == "--av");
  if (argc > 1 && !initialize_av) {
    std::cerr << "Uso: wmix-obs-smoke [--av | --scene | --dual | --switch | --control]\n";
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
        if (initialize_scene || initialize_dual || initialize_switch || initialize_control) {
          obs_scene_t* program = obs_scene_create("WMix Program");
          obs_scene_t* preview = (initialize_dual || initialize_switch || initialize_control) ? obs_scene_create("WMix Preview") : nullptr;
          if (!program || ((initialize_dual || initialize_switch || initialize_control) && !preview)) {
            std::cerr << "WMix: falha ao criar cenas.\n";
            result = 1;
          } else {
            // Channel 0 is Program. Preview remains independent until a
            // dedicated preview display is connected to the frontend.
            obs_set_output_source(0, obs_scene_get_source(program));
            std::cout << "WMix: Program vinculado ao canal 0.\n";
            if (preview) {
              std::cout << "WMix: Preview criado separadamente (sem saida visual).\n";
              if (obs_scene_get_source(preview) == obs_scene_get_source(program)) {
                std::cerr << "WMix: Preview e Program nao sao independentes.\n";
                result = 1;
              }
            }
          }
          if (initialize_switch && program && preview && result == 0) {
            // CUT: replace output source atomically, retaining both scene objects.
            obs_source_t* preview_source = obs_scene_get_source(preview);
            obs_set_output_source(0, preview_source);
            obs_source_t* active = obs_get_output_source(0);
            if (active != preview_source) {
              std::cerr << "WMix: CUT nao atualizou a saida Program.\n";
              result = 1;
            } else {
              std::cout << "WMix: CUT Preview -> Program concluido.\n";
            }
            if (active) obs_source_release(active);
          }
          if (initialize_control && program && preview && result == 0) {
            // Line-oriented command protocol. This is a native CLI transport,
            // not yet connected to the browser-based WMix interface.
            std::cout << "READY WMIX_OBS_CONTROL_V1" << std::endl;
            std::string command;
            bool preview_on_air = false;
            while (std::getline(std::cin, command)) {
              if (command == "QUIT") {
                std::cout << "BYE" << std::endl;
                break;
              }
              if (command == "STATUS") {
                std::cout << "STATUS " << (preview_on_air ? "PREVIEW" : "PROGRAM") << std::endl;
              } else if (command == "CUT") {
                preview_on_air = !preview_on_air;
                obs_source_t* desired = obs_scene_get_source(preview_on_air ? preview : program);
                obs_set_output_source(0, desired);
                obs_source_t* active = obs_get_output_source(0);
                const bool ok = active == desired;
                if (active) obs_source_release(active);
                std::cout << (ok ? "OK CUT " : "ERROR CUT ")
                          << (preview_on_air ? "PREVIEW" : "PROGRAM") << std::endl;
                if (!ok) {
                  result = 1;
                  break;
                }
              } else if (!command.empty()) {
                std::cout << "ERROR UNKNOWN_COMMAND" << std::endl;
              }
            }
          }
          obs_set_output_source(0, nullptr);
          if (preview) obs_scene_release(preview);
          if (program) obs_scene_release(program);
        }
      }
    }
  } else {
    std::cout << "WMix: libobs inicializado. Use --av para testar video e audio.\n";
  }

  obs_shutdown();
  return result;
}
