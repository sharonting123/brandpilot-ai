// 口播分段小工具（可选）：编译后供 Node text-segment.js 调用
// g++ -O2 -std=c++17 -o s2v_segment.exe s2v_segment.cpp

#include <iostream>
#include <sstream>
#include <string>
#include <vector>

static std::string read_stdin() {
  std::ostringstream ss;
  ss << std::cin.rdbuf();
  return ss.str();
}

static void trim(std::string& s) {
  while (!s.empty() && (s.front() == ' ' || s.front() == '\n' || s.front() == '\r' || s.front() == '\t')) s.erase(s.begin());
  while (!s.empty() && (s.back() == ' ' || s.back() == '\n' || s.back() == '\r' || s.back() == '\t')) s.pop_back();
}

static std::vector<std::string> split_text(const std::string& input, int max_chars) {
  std::vector<std::string> out;
  std::string rest = input;
  trim(rest);
  if (rest.empty()) return out;
  if ((int)rest.size() <= max_chars) {
    out.push_back(rest);
    return out;
  }

  const std::string stops = "。！？；，、 ";
  while (!rest.empty()) {
    if ((int)rest.size() <= max_chars) {
      out.push_back(rest);
      break;
    }
    std::string chunk = rest.substr(0, max_chars);
    int last_stop = -1;
    for (int i = 0; i < (int)chunk.size(); ++i) {
      if (stops.find(chunk[i]) != std::string::npos) last_stop = i;
    }
    if (last_stop >= 18) chunk = rest.substr(0, last_stop + 1);
    trim(chunk);
    if (!chunk.empty()) out.push_back(chunk);
    rest = rest.substr(chunk.size());
    trim(rest);
  }
  return out;
}

static std::string json_escape(const std::string& s) {
  std::string o;
  o.reserve(s.size() + 8);
  for (char c : s) {
    if (c == '\\' || c == '"') { o.push_back('\\'); o.push_back(c); }
    else if (c == '\n') o += "\\n";
    else if (c == '\r') continue;
    else o.push_back(c);
  }
  return o;
}

int main(int argc, char** argv) {
  int max_chars = 58;
  if (argc > 1) max_chars = std::stoi(argv[1]);
  auto segments = split_text(read_stdin(), max_chars);
  std::cout << "{\"segments\":[";
  for (size_t i = 0; i < segments.size(); ++i) {
    if (i) std::cout << ',';
    std::cout << '"' << json_escape(segments[i]) << '"';
  }
  std::cout << "]}";
  return 0;
}
