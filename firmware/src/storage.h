#ifndef CV_STORAGE_H
#define CV_STORAGE_H
#include "cvid.h"
#define CV_LIBRARY_MAX 96
typedef struct { char name[32]; cv_header h; } cv_video;
extern cv_video cv_videos[CV_LIBRARY_MAX];
extern int cv_count, cv_invalid;
int cv_scan(void);
int cv_open(int video);
void cv_close(void);
int cv_load_frame(unsigned index);
const uint8_t *cv_frame(void);
int cv_thumbnail(int video,uint8_t *dest);
#endif
