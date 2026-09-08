cmake_minimum_required(VERSION 3.15)
project(CasioVideo VERSION 0.1.1 LANGUAGES C)
include(GenerateG3A)
find_package(Gint 2.9 REQUIRED)
add_executable(casiovideo src/main.c src/storage.c src/cvid.c)
target_compile_options(casiovideo PRIVATE -Wall -Wextra -Os -flto)
target_link_libraries(casiovideo Gint::Gint)
generate_g3a(TARGET casiovideo OUTPUT CasioVideo.g3a NAME "CasioVideo" VERSION "0.1.1"
  ICONS assets/icon-uns.png assets/icon-sel.png)
