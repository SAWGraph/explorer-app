import { useQueryStore } from '../../store/queryStore';
import { DefinedTerm } from '../common/DefinedTerm';
import { QuestionPreview } from './QuestionPreview';
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
  const pointTypesOnly = question.relationship.type === 'groundwaterConnected';

  return (
    <div className="query-editor">
      <QuestionPreview question={question} />

      <EntityBlock
        label={blockLabel('A')}
        value={question.blockA}
        onChange={setBlockA}
        pointTypesOnly={pointTypesOnly}
      />

      <RelationshipSelector
        value={question.relationship}
        onChange={setRelationship}
        blockTypes={[question.blockA.type, question.blockC.type]}
      />

      <EntityBlock
        label={blockLabel('C')}
        value={question.blockC}
        onChange={setBlockC}
        pointTypesOnly={pointTypesOnly}
      />
    </div>
  );
}
