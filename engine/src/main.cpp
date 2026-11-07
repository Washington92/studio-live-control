#include <algorithm>
#include <chrono>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

namespace {
using Clock = std::chrono::steady_clock;
struct Config { int width = 640; int height = 360; int fps = 30; };
struct Frame { std::uint64_t index; std::int64_t pts_us; std::vector<std::uint8_t> rgb; };

Frame make_frame(const Config& config, std::uint64_t index) {
  Frame frame{index, static_cast<std::int64_t>(index * 1000000ULL / config.fps),
              std::vector<std::uint8_t>(static_cast<std::size_t>(config.width) * config.height * 3)};
  constexpr std::uint8_t colors[7][3] = {
    {192,192,192},{192,192,0},{0,192,192},{0,192,0},{192,0,192},{192,0,0},{0,0,192}
  };
  for (int y = 0; y < config.height; ++y) {
    for (int x = 0; x < config.width; ++x) {
      const int bar = std::min(6, x * 7 / config.width);
      const auto offset = (static_cast<std::size_t>(y) * config.width + x) * 3;
      for (int channel = 0; channel < 3; ++channel) frame.rgb[offset + channel] = colors[bar][channel];
      if (y >= config.height * 9 / 10) {
        const bool marker = ((x / 16 + static_cast<int>(index / 10)) % 2) == 0;
        for (int channel = 0; channel < 3; ++channel) frame.rgb[offset + channel] = marker ? 24 : 8;
      }
    }
  }
  return frame;
}

void save_ppm(const Frame& frame, const Config& config, const std::string& path) {
  std::ofstream file(path, std::ios::binary);
  if (!file) throw std::runtime_error("Nao foi possivel abrir arquivo de saida");
  file << "P6\n" << config.width << ' ' << config.height << "\n255\n";
  file.write(reinterpret_cast<const char*>(frame.rgb.data()),
             static_cast<std::streamsize>(frame.rgb.size()));
  if (!file) throw std::runtime_error("Falha ao gravar quadro");
}

bool selftest() {
  const Config config{640, 360, 30};
  const auto first = make_frame(config, 0);
  const auto next = make_frame(config, 1);
  return first.index == 0 && first.pts_us == 0 && next.pts_us == 33333 &&
         first.rgb.size() == 640ULL * 360 * 3 && first.rgb[0] == 192 &&
         first.rgb[1] == 192 && first.rgb[2] == 192;
}
} // namespace

int main(int argc, char** argv) {
  try {
    if (argc == 2 && std::string(argv[1]) == "--selftest") {
      if (!selftest()) return 1;
      std::cout << "WMix Engine selftest OK\n";
      return 0;
    }
    if (argc == 3 && std::string(argv[1]) == "--frame") {
      const Config config;
      save_ppm(make_frame(config, 0), config, argv[2]);
      std::cout << "Frame 640x360 gerado: " << argv[2] << '\n';
      return 0;
    }
    if (argc == 3 && std::string(argv[1]) == "--benchmark") {
      const int count = std::stoi(argv[2]);
      if (count <= 0 || count > 100000) throw std::invalid_argument("Quantidade invalida");
      const Config config;
      const auto start = Clock::now();
      std::uint64_t checksum = 0;
      for (int i = 0; i < count; ++i) {
        const auto frame = make_frame(config, static_cast<std::uint64_t>(i));
        checksum += frame.rgb[0];
      }
      const auto elapsed = std::chrono::duration<double>(Clock::now() - start).count();
      std::cout << "frames=" << count << " seconds=" << elapsed
                << " render_fps=" << count / std::max(elapsed, 0.000001)
                << " checksum=" << checksum << '\n';
      return 0;
    }
    std::cout << "WMix Engine 0.1 | teste nativo de frames\n"
              << "Uso: wmix-engine --selftest | --frame saida.ppm | --benchmark 300\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << "WMix Engine: " << error.what() << '\n';
    return 1;
  }
}
