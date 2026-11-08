#include <obs.h>
#include <iostream>
#include <string>

int main(int argc, char** argv) {
  const bool initialize_scene = argc == 2 && std::string(argv[1]) == "--scene";
  const bool initialize_control = argc == 2 && std::string(argv[1]) == "--control";
  const bool initialize_sources = argc == 2 && std::string(argv[1]) == "--sources";
  const bool initialize_switch = argc == 2 && std::string(argv[1]) == "--switch";
  const bool initialize_dual = argc == 2 && std::string(argv[1]) == "--dual";
  const bool initialize_av = initialize_scene || initialize_dual || initialize_switch || initialize_control || initialize_sources || (argc == 2 && std::string(argv[1]) == "--av");
  if (argc > 1 && !initialize_av) {
    std::cerr << "Uso: wmix-obs-smoke [--av | --scene | --dual | --switch | --control | --sources]\n";
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
        if (initialize_sources || initialize_control) {
          // Initialize video/audio before loading plugins, as in OBS startup.
          obs_load_all_modules();
          obs_log_loaded_modules();
          obs_post_load_modules();
        }
        if (initialize_scene || initialize_dual || initialize_switch || initialize_control || initialize_sources) {
          obs_scene_t* program = obs_scene_create("WMix Program");
          obs_scene_t* preview = (initialize_dual || initialize_switch || initialize_control || initialize_sources) ? obs_scene_create("WMix Preview") : nullptr;
          if (!program || ((initialize_dual || initialize_switch || initialize_control || initialize_sources) && !preview)) {
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
          if (initialize_sources && program && preview && result == 0) {
            // A built-in libobs color source is a reproducible first input.
            // It proves source creation and scene attachment, not camera capture.
            obs_source_t* source = obs_source_create("color_source", "WMix Test Color", nullptr, nullptr);
            if (!source) {
              std::cerr << "WMix: color_source unavailable (check OBS plugins).\n";
              result = 1;
            } else {
              obs_sceneitem_t* item = obs_scene_add(preview, source);
              if (!item) {
                std::cerr << "WMix: failed to attach source to Preview.\\n";
                result = 1;
              } else {
                std::cout << "WMix: test source attached to Preview.\\n";
              }
              obs_source_release(source);
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
            const auto active_scene_name = [&]() -> const char* {
              obs_source_t* active = obs_get_output_source(0);
              const char* name = "UNKNOWN";
              if (active == obs_scene_get_source(preview)) name = "PREVIEW";
              else if (active == obs_scene_get_source(program)) name = "PROGRAM";
              if (active) obs_source_release(active);
              return name;
            };
            while (std::getline(std::cin, command)) {
              if (command == "QUIT") {
                std::cout << "BYE" << std::endl;
                break;
              }
              if (command == "STATUS") {
                std::cout << "STATUS " << active_scene_name() << std::endl;
              } else if (command == "TALLY_STATUS") {
                // Derive tally from the output channel, never from the last
                // requested CUT. This detects external output changes too.
                obs_source_t* active = obs_get_output_source(0);
                const char* scene = "UNKNOWN";
                if (active == obs_scene_get_source(preview)) scene = "PREVIEW";
                else if (active == obs_scene_get_source(program)) scene = "PROGRAM";
                std::cout << "TALLY_STATUS " << scene << std::endl;
                if (active) obs_source_release(active);
              } else if (command == "VIDEO_STATUS") {
                // Report actual libobs video subsystem configuration, not an
                // unverified frame counter or a claim that Preview is visible.
                obs_video_info current{};
                if (!obs_get_video_info(&current)) {
                  std::cout << "ERROR VIDEO_UNAVAILABLE" << std::endl;
                } else {
                  std::cout << "VIDEO_STATUS "
                            << current.output_width << "x" << current.output_height
                            << " " << current.fps_num << "/" << current.fps_den
                            << std::endl;
                }
              } else if (command == "PREVIEW_SOURCE_STATUS") {
                // Check scene membership, not just source registration.
                const bool attached = obs_scene_find_source(preview, "WMix Test Color") != nullptr;
                std::cout << "PREVIEW_SOURCE_STATUS " << (attached ? "PRESENT" : "ABSENT")
                          << " WMix Test Color" << std::endl;
              } else if (command == "PROGRAM_SOURCE_STATUS") {
                // Inspect the actual scene connected to output channel 0.
                // This verifies scene routing, not decoded/rendered video frames.
                obs_source_t* active = obs_get_output_source(0);
                obs_source_t* preview_source = obs_scene_get_source(preview);
                obs_source_t* program_source = obs_scene_get_source(program);
                const bool known_scene = active == preview_source || active == program_source;
                obs_scene_t* active_scene = active == preview_source ? preview : program;
                obs_sceneitem_t* item = known_scene
                  ? obs_scene_find_source(active_scene, "WMix Test Color") : nullptr;
                std::cout << "PROGRAM_SOURCE_STATUS "
                          << (known_scene && item ? "PRESENT" : "ABSENT")
                          << " WMix Test Color" << std::endl;
                if (active) obs_source_release(active);
              } else if (command == "SOURCE_STATUS") {
                // Expose native source presence independently of the web input list.
                obs_source_t* test_source = obs_get_source_by_name("WMix Test Color");
                const bool exists = test_source != nullptr;
                if (test_source) obs_source_release(test_source);
                std::cout << "SOURCE_STATUS " << (exists ? "PRESENT" : "ABSENT")
                          << " WMix Test Color" << std::endl;
              } else if (command == "ADD_TEST_SOURCE") {
                // A deterministic source for verifying native scene wiring.
                // Real cameras and UI input IDs require a separate mapping protocol.
                obs_source_t* existing = obs_get_source_by_name("WMix Test Color");
                if (existing) {
                  // A source in the OBS registry is not necessarily attached
                  // to Preview; repair that state instead of falsely succeeding.
                  obs_sceneitem_t* attached = obs_scene_find_source(preview, "WMix Test Color");
                  if (!attached) attached = obs_scene_add(preview, existing);
                  std::cout << (attached ? "OK SOURCE WMix Test Color" : "ERROR SOURCE_ATTACH")
                            << std::endl;
                  obs_source_release(existing);
                } else {
                  obs_source_t* source = obs_source_create("color_source", "WMix Test Color", nullptr, nullptr);
                  if (!source) {
                    std::cout << "ERROR SOURCE_UNAVAILABLE" << std::endl;
                  } else {
                    obs_sceneitem_t* item = obs_scene_add(preview, source);
                    std::cout << (item ? "OK SOURCE WMix Test Color" : "ERROR SOURCE_ATTACH")
                              << std::endl;
                    obs_source_release(source);
                  }
                }
              } else if (command == "CUT") {
                // Route according to the real output, not a cached boolean.
                // Unknown output must not be silently replaced by a test CUT.
                const std::string before = active_scene_name();
                if (before == "UNKNOWN") {
                  std::cout << "ERROR CUT UNKNOWN" << std::endl;
                  continue;
                }
                const bool switch_to_preview = before == "PROGRAM";
                obs_source_t* desired = obs_scene_get_source(switch_to_preview ? preview : program);
                obs_set_output_source(0, desired);
                const std::string after = active_scene_name();
                const bool ok = after == (switch_to_preview ? "PREVIEW" : "PROGRAM");
                std::cout << (ok ? "OK CUT " : "ERROR CUT ") << after << std::endl;
                if (!ok) {
                  // Keep the control loop alive so STATUS and QUIT still work.
                  std::cerr << "WMix: CUT nao confirmado pelo libobs. Estado anterior preservado.\n";
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
