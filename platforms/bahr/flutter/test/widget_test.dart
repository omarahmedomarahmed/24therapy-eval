import 'dart:typed_data';

import 'package:bahr_mind/main.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';

void main() {
  testWidgets('one RTL screen with the Bahr labels and the default server', (tester) async {
    await tester.pumpWidget(const BahrApp());
    expect(find.text('http://10.0.2.2:3060'), findsOneWidget);
    expect(find.textContaining('Bahr Mind'), findsOneWidget);
    expect(find.textContaining('Feed bundled audio'), findsOneWidget);
    expect(find.byType(FlutterLogo), findsOneWidget);
    expect(Directionality.of(tester.element(find.byType(CallScreen))), TextDirection.rtl);
  });

  test('parseWav reads a 16 kHz mono header', () {
    final b = BytesBuilder()
      ..add('RIFF'.codeUnits)
      ..add(_u32(36 + 4))
      ..add('WAVEfmt '.codeUnits)
      ..add(_u32(16))
      ..add([1, 0, 1, 0])
      ..add(_u32(16000))
      ..add(_u32(32000))
      ..add([2, 0, 16, 0])
      ..add('data'.codeUnits)
      ..add(_u32(4))
      ..add([1, 0, 0xff, 0xff]);
    final (pcm, rate, ch) = parseWav(b.toBytes());
    expect((rate, ch), (16000, 1));
    expect(pcm, [1, -1]);
  });
}

List<int> _u32(int v) => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255];
