import { useQueryStore } from '../../store/queryStore';
import { DefinedTerm } from '../common/DefinedTerm';
import { QuestionPreview } from './QuestionPreview';
import { NLQueryBar } from './NLQueryBar';
import { EntityBlock } from './EntityBlock';
import { RelationshipSelector } from './RelationshipSelector';

function blockLabel(suffix: 'A' | 'C') {
  return (
    <>
      <DefinedTerm term='feature'>Features</DefinedTerm> or{' '}
      <DefinedTerm term='observation'>Observations</DefinedTerm> ({suffix})
    </>
  );
}

export function QueryEditorContent() {
  const { question, setBlockA, setBlockC, setRelationship } = useQueryStore();

  return (
    <div className="query-editor">
      <NLQueryBar />

      <QuestionPreview question={question} />

      <EntityBlock
        label={blockLabel('A')}
        value={question.blockA}
        onChange={setBlockA}
      />

      <RelationshipSelector value={question.relationship} onChange={setRelationship} />

      <EntityBlock
        label={blockLabel('C')}
        value={question.blockC}
        onChange={setBlockC}
      />
    </div>
  );
}
