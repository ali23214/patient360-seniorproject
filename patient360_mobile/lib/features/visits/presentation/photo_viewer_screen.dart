import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:lucide_icons_flutter/lucide_icons.dart';
import 'package:photo_view/photo_view.dart';

/// Full-screen viewer for an attached visit photo. Lets the patient pinch-
/// zoom and pan with [PhotoView], over a black backdrop.
class PhotoViewerScreen extends StatelessWidget {
  const PhotoViewerScreen({required this.url, super.key});

  final String url;

  static Future<void> open(BuildContext context, String url) {
    return Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => PhotoViewerScreen(url: url),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(LucideIcons.x),
          tooltip: 'إغلاق',
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: PhotoView(
        imageProvider: CachedNetworkImageProvider(url),
        backgroundDecoration: const BoxDecoration(color: Colors.black),
        minScale: PhotoViewComputedScale.contained,
        maxScale: PhotoViewComputedScale.covered * 4,
        loadingBuilder: (BuildContext _, ImageChunkEvent? __) =>
            const Center(
          child: CircularProgressIndicator(
            valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
          ),
        ),
        errorBuilder: (BuildContext _, Object __, StackTrace? ___) =>
            const Center(
          child: Icon(
            LucideIcons.imageOff,
            color: Colors.white,
            size: 64,
          ),
        ),
      ),
    );
  }
}
