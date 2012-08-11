/*  Note to reader:

    I definitely went overkill on this coding challenge, but I wanted 
    to show how I might structure my code in a more complex application.
    Could've easily done this without backbone/handlebars and just used jQuery UI draggable, 
    but I'd been meaning to teach myself the html5 drag drop stuff for a while now,
    and this seemed like a good opportunity to do so :)   */

(function ($, window, document) {
    //store everything inside TodoApp namespace
    var TodoApp = {
        statuses: {
            'todo': 'To do',
            'inprogress': 'In Progress',
            'done': 'Done'
        }
    };

    /*********************
    backbone model, collection, and views
    *********************/

    TodoApp.Task = Backbone.Model.extend({
        defaults: {
            text: 'Default Text',
            status: 'todo'
        },

        //if you DONT return anything it passed validation, 
        //if you DO return something, there's an error
        validate: function (){
            if ($.trim(this.attributes.text) === '') {
                return "Cannot create a blank task!";
            }

            if (!TodoApp.statuses[this.attributes.status]) {
                //probably would be better to construct this on the fly 
                //in case there are new potential statuses added
                return "Invalid status! Must be one of 'To do', 'In Progress', or 'Done'";
            }
        },

        canAddToCollection: function(collection) {
            //Basically, if the task is in "todo", you can only drag it into an 'inprogress' collection
            //If it's anything else, you can drag it anywhere except itself

            var type = this.get('type');

            //this switch is overkill for a simple todo app, but the code is designed 
            //in a way that would scale up to add more statuses if you wanted to
            switch (type) {

                //can't add an element to a collection it's already part of
                case collection.type:
                    return false;
                    break;

                //Items in ToDo can be dragged into In Progress, but not into Done.
                case 'todo':
                    if (collection.type !== "inprogress")
                        return false;
                    break;

                //Items in In Progress can be dragged into ToDo and Done.
                case 'inprogress':
                    if (!(collection.type === "todo" || collection.type === "done"))
                        return false;
                    break;

                //Items in Done can be dragged into ToDo and In Progress.
                case 'done':
                    if(!(collection.type === 'todo' || collection.type === "inprogress"))
                        return false;
                    break;
            }

            return true;
        }
    });
    
    //task collection
    TodoApp.TaskGroup = Backbone.Collection.extend({
        initialize: function(models, options){
            this.on('add', this.updateTaskStatus, this);
            this.type = options.type;
        },

        model: TodoApp.Task,

        //when a model is added to a collection, set it's type accordingly
        updateTaskStatus: function(task) {
            task.set('type', this.type)
        }
    });


    // jQuery doesnt copy this property by default into jQuery events. 
    jQuery.event.props.push('dataTransfer');


    TodoApp.TaskView = Backbone.View.extend({
        tagName: 'li',

        className: 'task',

        events: {
            //'drag': 'handleDrag',         //called on element you are dragging during drag
            'dragstart': 'handleDragStart', //called on element you are dragging when drag starts
            'dragend': 'handleDragEnd'      //called on element you are dragging when drag ends
        },

        handleDrag: function(e){}, //not used for anything at the moment

        handleDragStart: function(e) {
            this.$el.addClass('dragging');

            //Firefox needs to set some data... from http://marakana.com/s/html5_drag_n_drop_api,1071/index.html
            e.dataTransfer.setData('text','');

            //these show what kind of effects you can use.  visual effects varies between browers.
            //e.dataTransfer.effectAllowed = 'move';
            //e.dataTransfer.dropEffect = 'move';

            //setData doesnt seem to be fully implemented in all browsers yet and can only pass certain data types
            //so, just use TodoApp namespace to hold the data
            //e.dataTransfer.setData('text/html', $(e.target).innerHtml);
            //e.dataTransfer.setData('application/json', {"asdf":"asdf"}) //doenst work
            TodoApp.currentDraggingTask = this.model;

            //toggle 'display' on dropzones when you start dragging
            $('.dropzone').show(); 
        },

        handleDragEnd: function(e) {
            this.$el.removeClass('dragging');
            TodoApp.resetDragEffects();
        },

        template: Handlebars.compile($('#task-template').html()),

        render: function(){
            this.$el
                .html(this.template(this.model.attributes))
                .attr({
                    draggable: 'true',
                    id: this.model.cid
                });      

                //note: there doesnt seem to be a way to add attributes to the root tag of an element with templating
                //except for this.  Could also have nested a div inside the template, like:
                // <li><div id="c16" draggable="true">example task</div></li>           

            //for IE
            if (this.el.dragDrop) {
                this.el.onselectstart = function(){ this.dragDrop(); return false};
            }

            //points to the view instance that 'render' is being called on, which
            //allows you to chain other backbone methods when calling 'render'
            return this;
        }
    });
    

    // for some reason 'dragend' is not always fired when 'drop' is fired (it's supposed to according to the spec)
    // Seems like it's due to browser inconsistencies. Need to perform the following operations when a drag is finished,
    // so using this method in both the 'dragend' and 'drop' events
    TodoApp.resetDragEffects = function() {
        //toggle 'display' on dropzones when you start dragging
        this.$appContainer.find('.dropzone').hide(); 
        this.$appContainer.find('.invalid-drag-target-errors').hide(); 

        //if you were still dragging over something when drag ended 
        this.$appContainer.find('.dragover').removeClass('dragover valid-drag-target invalid-drag-target'); 
        this.$appContainer.find('.dragging').removeClass('dragging'); 
    };

    /*  Chrome has a bug where when you drag over a child element, "dragleave" fires on the parent, 
        even though you're still inside it.  See link below: 
        
        http://stackoverflow.com/questions/10867506/dragleave-of-parent-element-fires-when-dragging-over-children-elements

        I've addressed this issue by creating a "dropzone" div, which is a transparent 
        overlay that covers each task list. It's hidden except for when you're dragging tasks, 
        and is used as the drop target.  This way, the drop target has no child elements 
        so you dont need to worry about this occuring.         */


    TodoApp.TaskGroupView = Backbone.View.extend({
        events: {
            'dragenter .dropzone': 'handleDragEnter',    //called on element you drag OVER when mouse ENTERS element
            'dragover .dropzone': 'handleDragOver',      //called on element you drag OVER when mouse is STILL INSIDE element
            'dragleave .dropzone': 'handleDragLeave',    //called on element you drag OVER when mouse LEAVES element
            'drop .dropzone': 'handleDrop'               //called on element you drop on to
        },

        initialize: function(params){
            this.collection.on('add', this.appendTask, this);
            this.collection.on('remove', this.removeTask, this);
            
            this.type = params.type;
        },

        template: Handlebars.compile($('#task-group-template').html()),

        //called when mouse enters the dropzone, which is a transparent element overlayed over the task list
        handleDragEnter: function(e){

            //if this collection already contains the task we're dragging, don't show any dragover effects
            if (!this.collection.getByCid(TodoApp.currentDraggingTask.cid)) {

                if (TodoApp.currentDraggingTask.canAddToCollection(this.collection)) {
                    this.$el.addClass('dragover valid-drag-target');
                }
                else {
                    this.$el
                        .addClass('dragover invalid-drag-target')
                        .find('.invalid-drag-target-errors')
                            .show();
                }

            }

            return false;
        },
        
        //called while mouse is still inside element and dragging
        handleDragOver: function(e) {
            e.preventDefault(); // Drop event will not fire unles you cancel default behavior.
            e.stopPropagation();

            return false;
        },

        //if you're LEAVING the dropzone
        handleDragLeave: function(e){
            this.$el
                .removeClass('dragover valid-drag-target invalid-drag-target')
                .find('.invalid-drag-target-errors')
                    .hide();
        },

        handleDrop: function(e) {
            // default behavior in FireFox for a drop event is to navigate to the URL that was dropped on the drop target.
            e.preventDefault(); 
            
            var task = TodoApp.currentDraggingTask;

            if (task.canAddToCollection(this.collection)) {
                //remove it from old collection and add to new one
                task.collection.remove(task);
                this.collection.add(task);
            }

            TodoApp.resetDragEffects();
        },

        render: function(){
            this.$el.html(this.template({type: TodoApp.statuses[this.collection.type]}));

            //2nd param is context for 'this'
            this.collection.each(this.appendTask, this);

            return this;
        },

        appendTask: function(task, index, collection){
            var taskView = new TodoApp.TaskView ({ model: task });

            this.$el.find('.task-list').append(taskView.render().$el);

            this.updateCount();
        },

        removeTask: function(task, index, collection) {
            this.$el.find('#' + task.cid).remove();

            this.updateCount();
        },

        updateCount: function(){
            var $projectTextNode = this.$el.find('.counter .item-type');

            this.$el.find('.counter .count').text(this.collection.length);

            TodoApp.setPluralization($projectTextNode, this.collection.length, "Project");
            TodoApp.updateTotalCount();
        }
    });

    /*********************
    end of backbone stuff
    *********************/

    TodoApp.updateTotalCount = function(){
        var totalCount = 0,
            $projectTextNode = this.$appContainer.find('.total-counter .counter .item-type');

        _.each(TodoApp.taskGroups, function(taskGroup) {
            totalCount += taskGroup.length;
        });

        this.$appContainer.find('.total-counter .counter h3').text(totalCount);

        TodoApp.setPluralization($projectTextNode, totalCount, "Project");
    };

    //obviously wont work for all words, but good enough for this simple todo app
    TodoApp.setPluralization = function($el, count, word){
        var text = $el.text(),
            isPlural = text.toLowerCase().charAt(text.length-1) === 's';

        //make it singlular if it's plural but shouldnt be
        if (isPlural && count === 1) {
            $el.text(word);
        }

        //make it plural if it's singluar but should be plural
        if (!isPlural && count !== 1) {
            $el.text(word + 's');
        }
    };

    TodoApp.createTask = function(){
        var $input = this.$appContainer.find('.add-task-container input'),
            task = new TodoApp.Task({text: $input.val() }),
            errors = task.validate();

        if (!errors) {
            this.taskGroups.todoGroup.add(task);
            
            //reset input value and hide errors div
            $input.val('').hide().parent().find('.errors').hide();
        }
        else {
            this.$appContainer.find('.add-task-container .errors').text(errors).show();
        }
    }

    TodoApp.loadEvents = function(){
        var $addTaskContainer = this.$appContainer.find('.add-task-container'),
            $addTaskInput = $addTaskContainer.find('input');

        //shows the text field if it's hidden, else creates the task
        $addTaskContainer.find('button').on('click', function(e){
            if ($addTaskInput.is(':hidden')) {
                $addTaskInput.show().focus();
            }
            else {
                TodoApp.createTask();
            }
        });

        //create a new task when they press enter
        $addTaskInput.on('keyup', function(e){
            if (e.keyCode == 13) {      //enter
                e.preventDefault();
                TodoApp.createTask();
            } 
        });

    }

    TodoApp.init = function(){
        this.$appContainer = $("#todo-app");
        this.taskGroups = {};
        this.views = {};

        //create all the task groups
        this.taskGroups.todoGroup = new TodoApp.TaskGroup([], { type: 'todo' });
        this.taskGroups.inProgressGroup = new TodoApp.TaskGroup([], { type: 'inprogress' });
        this.taskGroups.doneGroup = new TodoApp.TaskGroup([], { type: 'done' });


        //create all the task views
        this.views.todoGroupView = new TodoApp.TaskGroupView({ 
            collection: TodoApp.taskGroups.todoGroup,
            el: "#todos"
        });
        this.views.inProgressGroupView = new TodoApp.TaskGroupView({ 
            collection: TodoApp.taskGroups.inProgressGroup,
            el: "#inprogress"
        });
        this.views.doneGroupView = new TodoApp.TaskGroupView({ 
            collection: TodoApp.taskGroups.doneGroup,
            el: "#done"
        });


        //render the views and append them to the page
        this.views.todoGroupView.render();
        this.views.inProgressGroupView.render();
        this.views.doneGroupView.render();

        //load events
        TodoApp.loadEvents();
        
        //create some seed data
        for (var i=1;i<13;i++) {
            var task = new TodoApp.Task({text: 'Project ' + i});

            if (i < 5) {
                this.taskGroups.todoGroup.add(task);
            }
            else if (i < 8) {
                this.taskGroups.inProgressGroup.add(task);
            }
            else {
                this.taskGroups.doneGroup.add(task);
            }
        }
    }

    TodoApp.init();

}(jQuery, window, document, undefined));






















