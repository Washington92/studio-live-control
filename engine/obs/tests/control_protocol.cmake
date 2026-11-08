if(NOT DEFINED WMIX_EXECUTABLE OR NOT DEFINED WMIX_COMMANDS)
  message(FATAL_ERROR "WMIX_EXECUTABLE and WMIX_COMMANDS are required")
endif()

execute_process(
  COMMAND "${WMIX_EXECUTABLE}" --control
  INPUT_FILE "${WMIX_COMMANDS}"
  OUTPUT_VARIABLE output
  ERROR_VARIABLE diagnostics
  RESULT_VARIABLE result
  TIMEOUT 25
)
if(NOT result STREQUAL "0")
  message(FATAL_ERROR "WMix control exited with ${result}: ${diagnostics}\n${output}")
endif()

# Compare ordered protocol lines; log messages emitted by libobs are ignored.
string(REPLACE "\r" "" output "${output}")
string(REPLACE "\n" ";" lines "${output}")
set(expected
  "READY WMIX_OBS_CONTROL_V1"
  "STATUS PROGRAM"
  "TALLY_STATUS PROGRAM"
  "VIDEO_STATUS 1280x720 30/1"
  "SOURCE_STATUS ABSENT WMix Test Color"
  "PREVIEW_SOURCE_STATUS ABSENT WMix Test Color"
  "PROGRAM_SOURCE_STATUS ABSENT WMix Test Color"
  "OK SOURCE WMix Test Color"
  "SOURCE_STATUS PRESENT WMix Test Color"
  "PREVIEW_SOURCE_STATUS PRESENT WMix Test Color"
  "PROGRAM_SOURCE_STATUS ABSENT WMix Test Color"
  "OK CUT PREVIEW"
  "STATUS PREVIEW"
  "TALLY_STATUS PREVIEW"
  "PROGRAM_SOURCE_STATUS PRESENT WMix Test Color"
  "BYE"
)
set(index 0)
list(LENGTH expected expected_count)
foreach(line IN LISTS lines)
  if(index GREATER_EQUAL expected_count)
    break()
  endif()
  list(GET expected ${index} wanted)
  if(line STREQUAL wanted)
    math(EXPR index "${index} + 1")
  endif()
endforeach()
if(NOT index EQUAL expected_count)
  list(GET expected ${index} missing)
  message(FATAL_ERROR "Protocol mismatch; expected next: [${missing}]\nActual:\n${output}\nDiagnostics:\n${diagnostics}")
endif()
message(STATUS "WMix native control protocol passed ${expected_count} ordered assertions")
