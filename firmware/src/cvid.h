#ifndef CVID_H
#define CVID_H
#include <stdint.h>
#include <stddef.h>
#define CV_HEADER 256u
#define CV_MAX_FILE 16800000u
#define CV_MAX_PIXELS (396u * 224u)
#define CV_THUMB_W 160
#define CV_THUMB_H 90
#define CV_THUMB_BYTES (CV_THUMB_W * CV_THUMB_H * 2)
typedef struct {
    uint16_t width, height, fps, key_interval;
    uint32_t frames, duration_ms, thumb_offset, thumb_bytes, index_offset, data_offset, size, crc;
    char title[121];
} cv_header;
uint16_t cv_u16(const uint8_t *p);
uint32_t cv_u32(const uint8_t *p);
uint32_t cv_crc32(const uint8_t *p, size_t n);
int cv_parse(cv_header *h, const uint8_t *p, uint32_t file_size);
int cv_decode(uint8_t *frame, size_t pixels, const uint8_t *src, size_t n, unsigned kind);
uint16_t cv_rgb565(uint8_t p);
#endif
