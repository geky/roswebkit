# CMake Setup
cmake_minimum_required(VERSION 2.4.6)
include($ENV{ROS_ROOT}/core/rosbuild/rosbuild.cmake)

# ROSBuild Setup
rosbuild_init()

set(EXECUTABLE_OUTPUT_PATH ${PROJECT_SOURCE_DIR}/bin)

# Call our prewritten Makefile
# This is much simpler than trying to make CMake 
# understand what to do.
execute_process(COMMAND make)
