/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { $ } from '../../../../../base/browser/dom.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { ImmortalReference } from '../../../../../base/common/lifecycle.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { createBareFontInfoFromRawSettings } from '../../../../../editor/common/config/fontInfoFromSettings.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { createTextModel } from '../../../../../editor/test/common/testTextModel.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { DisassemblyView, IDisassembledInstructionEntry, IInstructionColumnTemplateData, InstructionRenderer } from '../../browser/disassemblyView.js';
import { IDebugSession } from '../../common/debug.js';
import { mockUriIdentityService } from './mockDebugModel.js';

const SESSION_ID = 'aDebugSessionId';

const POSIX_PATH = '/home/user/project/main.c';

function createEntry(address: string, instructionBytes: string, instruction: string, location?: DebugProtocol.Source, line?: number): IDisassembledInstructionEntry {
	return {
		allowBreakpoint: true,
		isBreakpointSet: false,
		isBreakpointEnabled: false,
		instructionReference: '0x80000dde',
		instructionReferenceOffset: 0,
		instructionOffset: 0,
		showSourceLocation: !!location,
		instruction: { address, instructionBytes, instruction, location, line },
		address: BigInt(address),
	};
}

function renderedAddress(templateData: IInstructionColumnTemplateData): string {
	return (templateData.instruction.textContent ?? '').trim().split(/\s+/)[0];
}

suite('Debug - Disassembly View', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createRenderer(textModelService: ITextModelService): InstructionRenderer {
		const view = upcastPartial<DisassemblyView>({
			isSourceCodeRender: true,
			fontInfo: createBareFontInfoFromRawSettings({}, 1),
			onDidChangeStackFrame: Event.None,
			currentInstructionAddresses: [],
			focusedInstructionAddress: undefined,
			debugSession: upcastPartial<IDebugSession>({ getId: () => SESSION_ID }),
		});

		return disposables.add(new InstructionRenderer(
			view,
			new TestThemeService(),
			upcastPartial<IEditorService>({}),
			textModelService,
			mockUriIdentityService,
			new NullLogService(),
		));
	}

	test('renders address, bytes and mnemonic of the element it is given', async () => {
		const model = disposables.add(createTextModel('int main(void)\n{\n\treturn 0;\n}\n'));
		const renderer = createRenderer(upcastPartial<ITextModelService>({
			createModelReference: async () => new ImmortalReference(upcastPartial<IResolvedTextEditorModel>({ textEditorModel: model }))
		}));

		const entry = createEntry('0x80000f98', 'ce86', 'c.swsp x1,0x5C(x2)', { name: 'main.c', path: POSIX_PATH }, 3);
		const templateData = renderer.renderTemplate($('div'));
		renderer.renderElement(entry, 0, templateData);
		await timeout(0);

		assert.deepStrictEqual({
			address: renderedAddress(templateData),
			source: templateData.sourcecode.textContent,
		}, {
			address: '0x80000f98',
			source: '  3: \treturn 0;',
		});

		renderer.disposeElement(entry, 0, templateData);
		renderer.disposeTemplate(templateData);
	});

	test('renders its own element even when the source cannot be resolved', async () => {
		const renderer = createRenderer(upcastPartial<ITextModelService>({
			createModelReference: () => Promise.reject(new Error(`Unable to read file '${POSIX_PATH}'`))
		}));

		const templateData = renderer.renderTemplate($('div'));

		// A row without source information renders synchronously and correctly.
		renderer.renderElement(createEntry('0x80000f96', '711d', 'c.addi16sp -0x60'), 0, templateData);
		assert.strictEqual(renderedAddress(templateData), '0x80000f96');

		// The same template is then recycled for a row that does carry source information.
		renderer.renderElement(createEntry('0x80000f98', 'ce86', 'c.swsp x1,0x5C(x2)', { name: 'main.c', path: POSIX_PATH }, 3), 1, templateData);
		await timeout(0);

		assert.deepStrictEqual({
			address: renderedAddress(templateData),
			source: templateData.sourcecode.textContent,
		}, {
			address: '0x80000f98',
			source: '',
		});

		renderer.disposeTemplate(templateData);
	});
});
